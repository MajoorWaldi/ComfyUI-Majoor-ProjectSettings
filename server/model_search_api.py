"""
Model search API for CivitAI, Hugging Face, and GitHub.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
import json

logger = logging.getLogger(__name__)

import time
import threading

# --- Hugging Face File Search ---

# Whitelist of HF repos that are known to host useful model files directly
# (as opposed to being 'model cards' that point to other repos).
# This is a fallback search mechanism.
HF_FILE_SEARCH_REPOS = [
    "Kijai/WanVideo_comfy",
    "stabilityai/sd-vae-ft-mse-original",
    "stabilityai/sdxl-vae",
    # Add other repos known to host raw .safetensors/.ckpt files here
]

# Cache for Hugging Face tree listings to avoid redundant API calls.
# Format: { "repo_id": (timestamp, file_list) }
_hf_tree_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_hf_tree_cache_lock = threading.Lock()
HF_TREE_CACHE_TTL = 600  # 10 minutes

SEARCH_TIMEOUT = 30  # seconds - increased for more thorough search


def calculate_match_score(query: str, candidate: str, filename: str = "") -> Tuple[float, str]:
    """
    Calculate how well a candidate matches the query.
    Handles special characters, underscores, and long names.

    Returns:
        Tuple of (score from 0-100, match_level description)
    """
    if not query or not candidate:
        return 0.0, "No match"

    query_lower = query.lower().strip()
    candidate_lower = candidate.lower().strip()
    filename_lower = filename.lower().strip()

    # Normalize: remove common separators and extra spaces
    def normalize(text):
        # Remove extensions
        text = re.sub(r'\.(safetensors|ckpt|pt|pth|bin)$', '', text, flags=re.IGNORECASE)
        # Replace ALL separators (hyphens, underscores, dots) with spaces
        text = re.sub(r'[-_\.]+', ' ', text)
        # Remove special characters except alphanumeric and spaces
        text = re.sub(r'[^a-z0-9\s]', ' ', text)
        # Remove extra spaces
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    query_norm = normalize(query_lower)
    candidate_norm = normalize(candidate_lower)
    filename_norm = normalize(filename_lower)

    # Exact match (100%)
    if query_norm == candidate_norm or query_norm == filename_norm:
        return 100.0, "Exact match"

    # Check if query is contained in candidate or filename
    # Only give high score if query is significant portion of candidate
    if query_norm in candidate_norm or query_norm in filename_norm:
        # Calculate ratio to avoid false positives
        target = candidate_norm if query_norm in candidate_norm else filename_norm
        ratio = len(query_norm) / max(len(target), 1)
        if ratio > 0.7:  # Query is most of the candidate
            return 95.0, "Near exact match"
        elif ratio > 0.4:  # Query is significant part
            return 90.0, "Contains query"
        else:  # Query is small part of candidate
            return 70.0, "Contains query (partial)"

    # Check if candidate contains query - usually means query is too broad or mismatched
    if candidate_norm in query_norm or filename_norm in query_norm:
        # Calculate how much of query is the candidate
        source = query_norm if candidate_norm in query_norm else query_norm
        target = candidate_norm if candidate_norm in query_norm else filename_norm
        ratio = len(target) / max(len(source), 1)
        if ratio > 0.5:  # Candidate is significant part of query
            return 60.0, "Subset match"
        else:
            # Likely a false positive (e.g., "vision" in "completely_wrong_name")
            return 20.0, "Weak match"

    # Word-by-word matching: Give high scores for near-complete matches
    query_words = set(query_norm.split())
    candidate_words = set(candidate_norm.split())
    filename_words = set(filename_norm.split())

    all_words = candidate_words | filename_words

    # Case 1: All query words are present in the candidate/filename.
    # This handles when the query is missing words (e.g., 'visual').
    if query_words and query_words.issubset(all_words):
        extra_words = len(all_words - query_words)
        # Few extra words means a very strong match.
        if extra_words <= 2:
            return 96.0 - (extra_words * 3), "Near-exact word match"
        # More extra words, still a good match.
        else:
            return 88.0, "All query words match"

    # Case 2: All candidate/filename words are present in the query.
    # This handles when the query has extra, irrelevant words.
    if all_words and all_words.issubset(query_words):
        extra_words = len(query_words - all_words)
        if extra_words <= 2:
            return 94.0 - (extra_words * 3), "Candidate is subset of query"
        else:
            return 85.0, "Subset word match"

    # Case 3: Partial overlap, use Jaccard similarity.
    if query_words or all_words:
        common_words = query_words.intersection(all_words)
        jaccard_sim = len(common_words) / len(query_words.union(all_words)) if (query_words or all_words) else 0

        if jaccard_sim >= 0.7:
            return 80.0, "High word similarity"
        elif jaccard_sim >= 0.5:
            return 70.0, "Good word similarity"
        elif jaccard_sim > 0.3:
            return 60.0, "Some words match"

    # Fuzzy substring match (30-50%)
    # Check for partial word matches
    partial_score = 0
    for q_word in query_words:
        for c_word in all_words:
            if len(q_word) >= 4 and q_word in c_word:
                partial_score += 10
            elif len(c_word) >= 4 and c_word in q_word:
                partial_score += 8

    if partial_score > 0:
        score = min(50.0, 30.0 + partial_score)
        return score, "Partial match"

    # Very low or no match
    return 10.0, "Poor match"


def _make_request(url: str, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Make HTTP request and return JSON response."""
    if headers is None:
        headers = {}
    headers.setdefault("User-Agent", "ComfyUI-Majoor-Downloader")

    try:
        request = Request(url, headers=headers)
        with urlopen(request, timeout=SEARCH_TIMEOUT) as resp:
            data = resp.read()
            return json.loads(data.decode("utf-8"))
    except Exception as e:
        logger.warning("Request failed for %s: %s", url, str(e))
        return {}


def search_civitai(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for models on CivitAI.

    Args:
        query: Model name to search for
        limit: Maximum number of results

    Returns:
        List of results with format:
        {
            "platform": "civitai",
            "name": str,
            "url": str,  # download URL
            "page_url": str,  # web page URL
            "type": str,  # model type (checkpoint, lora, etc)
            "version": str,
            "size_mb": int,
            "sha256": str (optional)
        }
    """
    results = []

    try:
        # CivitAI API search endpoint
        params = {
            "query": query,
            "limit": limit,
            "nsfw": "false"
        }
        url = f"https://civitai.com/api/v1/models?{urlencode(params)}"

        data = _make_request(url)
        items = data.get("items", [])

        for item in items[:limit]:
            model_id = item.get("id")
            model_name = item.get("name", "")
            model_type = item.get("type", "").lower()

            # Get latest version
            versions = item.get("modelVersions", [])
            if not versions:
                continue

            latest = versions[0]
            version_name = latest.get("name", "")
            files = latest.get("files", [])

            # Find primary file
            primary_file = None
            for f in files:
                if f.get("primary", False):
                    primary_file = f
                    break

            if not primary_file and files:
                primary_file = files[0]

            if not primary_file:
                continue

            download_url = primary_file.get("downloadUrl", "")
            if not download_url:
                continue

            # Map CivitAI types to ComfyUI kinds
            type_mapping = {
                "checkpoint": "checkpoints",
                "lora": "loras",
                "textualinversion": "embeddings",
                "hypernetwork": "loras",
                "aestheticgradient": "loras",
                "controlnet": "controlnet",
                "vae": "vae",
                "upscaler": "upscale_models",
            }
            kind = type_mapping.get(model_type, "checkpoints")

            size_kb = primary_file.get("sizeKB", 0)
            size_mb = int(size_kb / 1024) if size_kb else 0

            # Get hashes
            hashes = primary_file.get("hashes", {})
            sha256 = hashes.get("SHA256", "")

            # Calculate match score
            full_name = f"{model_name} - {version_name}"
            score, match_level = calculate_match_score(query, full_name, primary_file.get("name", ""))

            results.append({
                "platform": "civitai",
                "name": full_name,
                "filename": primary_file.get("name", ""),
                "url": download_url,
                "page_url": f"https://civitai.com/models/{model_id}",
                "type": kind,
                "version": version_name,
                "size_mb": size_mb,
                "sha256": sha256.lower() if sha256 else None,
                "match_score": score,
                "match_level": match_level,
            })

    except Exception as e:
        logger.error("CivitAI search failed: %s", str(e))

    # Sort by match score (highest first) and filter out poor matches
    results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    # Only return results with score >= 30 (configurable threshold)
    results = [r for r in results if r.get("match_score", 0) >= 30]

    return results[:limit]


def _get_official_sd_models() -> Dict[str, Dict[str, Any]]:
    """
    Return known official Stable Diffusion models on Hugging Face.
    This helps find models that might not appear in search results.
    """
    return {
        "v1-5-pruned-emaonly": {
            "model_id": "runwayml/stable-diffusion-v1-5",
            "filename": "v1-5-pruned-emaonly.safetensors",
            "alt_filename": "v1-5-pruned-emaonly.ckpt",
            "name": "Stable Diffusion v1.5",
        },
        "v1-5-pruned": {
            "model_id": "runwayml/stable-diffusion-v1-5",
            "filename": "v1-5-pruned.safetensors",
            "name": "Stable Diffusion v1.5",
        },
        "v2-1_768-ema-pruned": {
            "model_id": "stabilityai/stable-diffusion-2-1",
            "filename": "v2-1_768-ema-pruned.safetensors",
            "name": "Stable Diffusion v2.1",
        },
        "v2-1_512-ema-pruned": {
            "model_id": "stabilityai/stable-diffusion-2-1-base",
            "filename": "v2-1_512-ema-pruned.safetensors",
            "name": "Stable Diffusion v2.1 Base",
        },
        "sd_xl_base_1.0": {
            "model_id": "stabilityai/stable-diffusion-xl-base-1.0",
            "filename": "sd_xl_base_1.0.safetensors",
            "name": "Stable Diffusion XL Base 1.0",
        },
        "sd_xl_refiner_1.0": {
            "model_id": "stabilityai/stable-diffusion-xl-refiner-1.0",
            "filename": "sd_xl_refiner_1.0.safetensors",
            "name": "Stable Diffusion XL Refiner 1.0",
        },
    }


def canonicalize_hf_url(url: str) -> str:
    """Converts a Hugging Face blob URL to a resolve URL for direct downloads."""
    if not isinstance(url, str):
        return url
    
    # Example: https://huggingface.co/Kijai/WanVideo_comfy/blob/main/open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors
    # ->        https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/open-clip-xlm-roberta-large-vit-huge-14_visual_fp16.safetensors
    return re.sub(r'huggingface\.co/([^/]+)/([^/]+)/blob/', r'huggingface.co/\1/\2/resolve/', url)


def _search_huggingface_repo_files(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Fallback search: Scans whitelisted Hugging Face repos for individual files.
    This is effective for repos that are collections of files rather than a single model.
    """
    if len(query) < 4:
        return []

    logger.info(f"Running fallback Hugging Face file search for query: {query}")
    results = []
    
    # Use a copy of the list to be thread-safe if it were to be modified live
    repos_to_scan = list(HF_FILE_SEARCH_REPOS)

    for repo_id in repos_to_scan:
        if len(results) >= limit:
            break

        files = []
        with _hf_tree_cache_lock:
            cached = _hf_tree_cache.get(repo_id)
            if cached and (time.time() - cached[0]) < HF_TREE_CACHE_TTL:
                files = cached[1]
                logger.debug(f"Using cached file list for HF repo: {repo_id}")
            else:
                try:
                    # Fetch file list from HF API
                    api_url = f"https://huggingface.co/api/models/{repo_id}/tree/main?recursive=True"
                    
                    # Get HF token if available
                    token = (
                        os.environ.get("HUGGINGFACE_HUB_TOKEN")
                        or os.environ.get("HF_TOKEN")
                        or os.environ.get("HUGGINGFACE_TOKEN")
                    )
                    headers = {}
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                    
                    data = _make_request(api_url, headers)
                    
                    if isinstance(data, list):
                        files = data
                        _hf_tree_cache[repo_id] = (time.time(), files)
                        logger.info(f"Fetched and cached file list for HF repo: {repo_id} ({len(files)} files)")
                except Exception as e:
                    logger.error(f"Failed to fetch file tree for HF repo {repo_id}: {e}")
                    # Cache the failure for a shorter time to avoid hammering the API
                    _hf_tree_cache[repo_id] = (time.time(), [])

        # Filter and score files
        for file_info in files:
            filepath = file_info.get("path", "")
            
            # Limit scan depth to avoid performance issues on huge repos
            if len(results) > limit * 2: # Stop scanning files if we have a decent number of candidates
                break

            if not filepath.endswith((".safetensors", ".ckpt", ".pt", ".pth", ".bin")):
                continue

            filename = filepath.split('/')[-1]
            score, match_level = calculate_match_score(query, filename, filename)

            if score >= 75:  # Use a slightly lower threshold for this targeted search
                # Construct download URL and ensure it's canonical
                download_url = canonicalize_hf_url(
                    f"https://huggingface.co/{repo_id}/resolve/main/{filepath}"
                )
                
                # Guess type from filename
                tags = repo_id.lower().split('/') + filename.lower().split('.')
                kind = "checkpoints"
                if "lora" in tags: kind = "loras"
                elif "vae" in tags: kind = "vae"
                elif "controlnet" in tags: kind = "controlnet"
                elif "clip" in tags: kind = "clip"
                
                results.append({
                    "platform": "huggingface",
                    "name": f"{repo_id} (file)",
                    "filename": filename,
                    "url": download_url,
                    "page_url": f"https://huggingface.co/{repo_id}/tree/main",
                    "type": kind,
                    "version": file_info.get("lastCommit", {}).get("oid", "main")[:7],
                    "size_mb": int(file_info.get("size", 0) / (1024 * 1024)),
                    "sha256": file_info.get("lfs", {}).get("oid"),
                    "match_score": score,
                    "match_level": f"{match_level} (in {repo_id})",
                })

    results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    return results[:limit]


def search_huggingface(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for models on Hugging Face.

    Args:
        query: Model name to search for
        limit: Maximum number of results

    Returns:
        List of results with same format as search_civitai
    """
    results = []

    # First, check if this matches a known official model
    official_models = _get_official_sd_models()
    query_normalized = query.lower().strip().replace("_", "-").replace(" ", "-")

    for model_key, model_info in official_models.items():
        model_key_normalized = model_key.lower().replace("_", "-")
        if model_key_normalized in query_normalized or query_normalized in model_key_normalized:
            # Direct match with official model
            model_id = model_info["model_id"]
            filename = model_info["filename"]
            alt_filename = model_info.get("alt_filename")

            # Try both filenames if available
            for fname in [filename, alt_filename] if alt_filename else [filename]:
                if fname:
                    download_url = f"https://huggingface.co/{model_id}/resolve/main/{fname}"

                    # Calculate match score
                    score, match_level = calculate_match_score(query, model_info["name"], fname)

                    # Boost score for exact filename matches
                    fname_base = fname.lower().replace(".safetensors", "").replace(".ckpt", "")
                    if query_normalized == fname_base:
                        score = 100.0
                        match_level = "Exact match (official)"
                    elif query_normalized.replace("-fp16", "").replace("-fp32", "") == fname_base:
                        # Match but with precision suffix
                        score = 98.0
                        match_level = "Exact match (fp16/fp32 variant)"

                    results.append({
                        "platform": "huggingface",
                        "name": f"{model_info['name']} (Official)",
                        "filename": fname,
                        "url": download_url,
                        "page_url": f"https://huggingface.co/{model_id}",
                        "type": "checkpoints",
                        "version": "official",
                        "size_mb": 0,  # Size not pre-computed
                        "sha256": None,
                        "match_score": score,
                        "match_level": match_level,
                    })

    # If we found exact official matches, return them
    if any(r.get("match_score", 0) >= 95 for r in results):
        # Ensure URLs are downloadable
        for r in results:
            r["url"] = canonicalize_hf_url(r["url"])
        return results[:limit]

    # Otherwise, continue with API search
    try:
        # Hugging Face API search endpoint
        params = {"search": query, "limit": limit * 2}
        url = f"https://huggingface.co/api/models?{urlencode(params)}"

        token = os.environ.get("HUGGINGFACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        data = _make_request(url, headers)

        if isinstance(data, list):
            for item in data:
                model_id = item.get("id", "")
                if not model_id:
                    continue

                # For model search, we often don't get a specific file, so we score based on the model ID/name
                score, match_level = calculate_match_score(query, model_id)

                # Find a suitable file to download (prefer safetensors)
                siblings = item.get("siblings", [])
                best_file = None
                for s in siblings:
                    rfilename = s.get("rfilename", "")
                    if rfilename.endswith(".safetensors"):
                        best_file = rfilename
                        break
                    elif rfilename.endswith((".ckpt", ".pt", ".bin")):
                        best_file = rfilename
                
                if not best_file:
                    continue

                download_url = canonicalize_hf_url(f"https://huggingface.co/{model_id}/resolve/main/{best_file}")
                
                results.append({
                    "platform": "huggingface",
                    "name": model_id,
                    "filename": best_file,
                    "url": download_url,
                    "page_url": f"https://huggingface.co/{model_id}",
                    "type": "checkpoints", # Guess, can be refined
                    "version": "main",
                    "size_mb": 0, # Size is not in this API response
                    "sha256": None,
                    "match_score": score,
                    "match_level": f"{match_level} (model)",
                })

    except Exception as e:
        logger.error("Hugging Face model search failed: %s", str(e))

    # --- Fallback to file search in whitelisted repos ---
    # If no high-confidence results from model search, try file search
    has_good_results = any(r.get("match_score", 0) >= 80 for r in results)
    if not has_good_results:
        logger.info(f"No high-confidence results for '{query}', trying fallback file search.")
        file_search_results = _search_huggingface_repo_files(query, limit)
        if file_search_results:
            results.extend(file_search_results)

    # De-duplicate results by URL, keeping the one with the highest score
    seen_urls = {}
    deduped_results = []
    for r in sorted(results, key=lambda x: x.get("match_score", 0), reverse=True):
        url = r.get("url")
        if url not in seen_urls:
            seen_urls[url] = r
            deduped_results.append(r)

    # Sort by match score (highest first) and filter out poor matches
    deduped_results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    final_results = [r for r in deduped_results if r.get("match_score", 0) >= 30]

    return final_results[:limit]


def search_github(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for models on GitHub releases.

    Args:
        query: Model name or repo to search for
        limit: Maximum number of results

    Returns:
        List of results with same format as search_civitai
    """
    results = []

    try:
        # GitHub search API
        params = {
            "q": f"{query} extension:safetensors OR extension:ckpt",
            "per_page": limit
        }
        url = f"https://api.github.com/search/repositories?{urlencode(params)}"

        # Get GitHub token if available
        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        headers = {"Accept": "application/vnd.github.v3+json"}
        if token:
            headers["Authorization"] = f"token {token}"

        data = _make_request(url, headers)
        items = data.get("items", [])

        for item in items[:limit]:
            full_name = item.get("full_name", "")
            if not full_name:
                continue

            # Get releases
            releases_url = f"https://api.github.com/repos/{full_name}/releases/latest"
            release_data = _make_request(releases_url, headers)

            assets = release_data.get("assets", [])
            if not assets:
                continue

            # Find model files in assets
            for asset in assets:
                name = asset.get("name", "")
                if not name.endswith((".safetensors", ".ckpt", ".pt", ".bin")):
                    continue

                download_url = asset.get("browser_download_url", "")
                if not download_url:
                    continue

                size = asset.get("size", 0)
                size_mb = int(size / (1024 * 1024)) if size else 0

                # Guess type from filename
                name_lower = name.lower()
                kind = "checkpoints"
                if "lora" in name_lower:
                    kind = "loras"
                elif "vae" in name_lower:
                    kind = "vae"
                elif "controlnet" in name_lower:
                    kind = "controlnet"

                # Calculate match score
                full_result_name = f"{full_name} - {name}"
                score, match_level = calculate_match_score(query, full_result_name, name)

                results.append({
                    "platform": "github",
                    "name": full_result_name,
                    "filename": name,
                    "url": download_url,
                    "page_url": item.get("html_url", ""),
                    "type": kind,
                    "version": release_data.get("tag_name", "latest"),
                    "size_mb": size_mb,
                    "sha256": None,
                    "match_score": score,
                    "match_level": match_level,
                })

                if len(results) >= limit:
                    break

            if len(results) >= limit:
                break

    except Exception as e:
        logger.error("GitHub search failed: %s", str(e))

    # Sort by match score (highest first) and filter out poor matches
    results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    results = [r for r in results if r.get("match_score", 0) >= 30]

    return results[:limit]


def _generate_search_variants(query: str) -> List[str]:
    """
    Generate search query variants to improve search results.
    Handles long names with special characters and underscores.

    Returns list of queries to try, ordered by specificity.
    Strategy: Try multiple normalized forms for better matching.
    """
    variants = []

    # Remove file extension but keep the rest
    query_clean = re.sub(r'\.(safetensors|ckpt|pt|pth|bin)$', '', query, flags=re.IGNORECASE)

    # 1. Original query (cleaned)
    variants.append(query_clean)

    # 2. Replace underscores and hyphens with spaces for better matching
    # Example: "Qwen_Rapid_AIO-NSFW-v5.3" → "Qwen Rapid AIO NSFW v5.3"
    query_with_spaces = re.sub(r'[-_]+', ' ', query_clean)
    if query_with_spaces != query_clean:
        variants.append(query_with_spaces)

    # 3. Replace underscores with hyphens (some APIs prefer hyphens)
    # Example: "stable_diffusion_v1_5" → "stable-diffusion-v1-5"
    query_with_hyphens = re.sub(r'_+', '-', query_clean)
    if query_with_hyphens != query_clean and query_with_hyphens not in variants:
        variants.append(query_with_hyphens)

    # Normalize for pattern matching
    normalized = query_clean.lower().strip()

    # 4. For very long names (>40 chars), try extracting key parts
    if len(query_clean) > 40:
        # Remove technical suffixes common in model names
        # Example: "model-name-v1.5-pruned-emaonly-fp16" → "model-name-v1.5"
        compact = re.sub(r'[-_](pruned|ema|emaonly|fp16|fp32|inpainting|training|diffusers)[-_]?', '-',
                        query_clean, flags=re.IGNORECASE)
        compact = re.sub(r'[-_]+', '-', compact).strip('-')
        if compact != query_clean and len(compact) >= 10:
            variants.append(compact)

    # 5. Extract main model name (first significant part before version/variant)
    # Example: "ModelName-v5.3-NSFW-AIO" → "ModelName"
    # But keep at least 2-3 meaningful parts for specificity
    parts = re.split(r'[-_\s]+', query_clean)
    if len(parts) >= 3:
        # Keep first 2-3 meaningful parts (skip very short parts like v1, v2, etc.)
        meaningful_parts = [p for p in parts if len(p) >= 3 or re.match(r'v\d+', p.lower())]
        if len(meaningful_parts) >= 2:
            base_name = ' '.join(meaningful_parts[:3])  # Take first 3 meaningful parts
            if base_name not in variants and len(base_name) >= 10:
                variants.append(base_name)

    # 6. Check if this is a known Stable Diffusion model
    if re.match(r'^v\d+-\d+', normalized):
        # Official SD model like "v1-5-pruned-emaonly"
        match = re.match(r'^v(\d+)-(\d+)', normalized)
        if match:
            variants.append(f"stable diffusion {match.group(1)}.{match.group(2)}")

    # Remove duplicates while preserving order
    seen = set()
    unique_variants = []
    for v in variants:
        v_clean = v.strip()
        # Normalize for comparison (case-insensitive, space-normalized)
        v_normalized = re.sub(r'\s+', ' ', v_clean.lower())
        if v_clean and v_normalized not in seen and len(v_clean) >= 3:
            seen.add(v_normalized)
            unique_variants.append(v_clean)

    # Return up to 4 variants for thorough search
    return unique_variants[:4]


def _extract_model_info_from_url(url: str, query: str) -> Optional[Dict[str, Any]]:
    """
    Extract model information from Hugging Face or GitHub URL.

    Args:
        url: The URL to extract info from
        query: Original search query for match scoring

    Returns:
        Dict with model info or None if extraction fails
    """
    try:
        # Hugging Face URL pattern: https://huggingface.co/{owner}/{model_name}
        hf_match = re.match(r'https?://(?:www\.)?huggingface\.co/([^/]+)/([^/?#]+)', url)
        if hf_match:
            owner, model_name = hf_match.groups()
            full_name = f"{owner}/{model_name}"

            # Try to get model files
            api_url = f"https://huggingface.co/api/models/{owner}/{model_name}"
            headers = {"User-Agent": "ComfyUI-Majoor-Downloader"}

            try:
                model_data = _make_request(api_url, headers)
                tags = model_data.get("tags", [])

                # Get files
                files_url = f"https://huggingface.co/api/models/{owner}/{model_name}/tree/main"
                files_data = _make_request(files_url, headers)

                # Find model files
                if isinstance(files_data, list):
                    for file_info in files_data:
                        path = file_info.get("path", "")
                        if path.endswith((".safetensors", ".ckpt", ".pt", ".bin")):
                            filename = path.split("/")[-1]
                            score, match_level = calculate_match_score(query, full_name, filename)

                            # Only return if score >= 80%
                            if score >= 80:
                                return {
                                    "platform": "huggingface",
                                    "name": full_name,
                                    "filename": filename,
                                    "url": f"https://huggingface.co/{owner}/{model_name}/resolve/main/{path}",
                                    "page_url": url,
                                    "type": "checkpoints",
                                    "version": "main",
                                    "size_mb": 0,
                                    "sha256": None,
                                    "match_score": score,
                                    "match_level": f"{match_level} (Web discovered)",
                                }
            except Exception as e:
                logger.debug(f"Failed to fetch HF model details for {full_name}: {e}")

        # GitHub URL pattern: https://github.com/{owner}/{repo}
        gh_match = re.match(r'https?://(?:www\.)?github\.com/([^/]+)/([^/?#]+)', url)
        if gh_match:
            owner, repo = gh_match.groups()
            full_name = f"{owner}/{repo}"

            # Try to get latest release
            api_url = f"https://api.github.com/repos/{owner}/{repo}/releases/latest"
            headers = {"Accept": "application/vnd.github.v3+json"}

            try:
                release_data = _make_request(api_url, headers)
                assets = release_data.get("assets", [])

                for asset in assets:
                    name = asset.get("name", "")
                    if name.endswith((".safetensors", ".ckpt", ".pt", ".bin")):
                        score, match_level = calculate_match_score(query, full_name, name)

                        # Only return if score >= 80%
                        if score >= 80:
                            return {
                                "platform": "github",
                                "name": f"{full_name} - {name}",
                                "filename": name,
                                "url": asset.get("browser_download_url", ""),
                                "page_url": url,
                                "type": "checkpoints",
                                "version": release_data.get("tag_name", "latest"),
                                "size_mb": int(asset.get("size", 0) / (1024 * 1024)),
                                "sha256": None,
                                "match_score": score,
                                "match_level": f"{match_level} (Web discovered)",
                            }
            except Exception as e:
                logger.debug(f"Failed to fetch GitHub release for {full_name}: {e}")

    except Exception as e:
        logger.debug(f"Failed to extract model info from {url}: {e}")

    return None


def search_web_first(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Web-first search: Use DuckDuckGo to find HuggingFace/GitHub links,
    then extract model info and filter by match score >= 80%.

    Args:
        query: Model name to search for
        limit: Maximum number of results to process

    Returns:
        List of results with match score >= 80%
    """
    results = []

    try:
        # DuckDuckGo HTML search (no API key needed)
        # Search specifically for HuggingFace and GitHub
        search_query = f"{query} site:huggingface.co OR site:github.com"

        # Use DuckDuckGo HTML endpoint
        params = {
            "q": search_query,
            "t": "h_",
            "ia": "web"
        }
        url = f"https://duckduckgo.com/html/?{urlencode(params)}"

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }

        request = Request(url, headers=headers)
        with urlopen(request, timeout=SEARCH_TIMEOUT) as resp:
            html = resp.read().decode("utf-8", errors="ignore")

            # Find HuggingFace and GitHub links
            hf_links = re.findall(r'href="([^"]*huggingface\.co/[^"]*)"', html)
            gh_links = re.findall(r'href="([^"]*github\.com/[^"]*)"', html)

            # Process links and extract model info
            processed_urls = set()
            for link in (hf_links + gh_links)[:limit * 2]:  # Process more links to get enough good results
                # Clean up DuckDuckGo redirect links
                if "uddg=" in link:
                    link = re.sub(r'.*uddg=([^&]+).*', r'\1', link)
                    link = link.replace("%3A", ":").replace("%2F", "/")

                # Avoid duplicates
                if link in processed_urls:
                    continue
                processed_urls.add(link)

                # Extract model info and check match score
                model_info = _extract_model_info_from_url(link, query)
                if model_info and model_info.get("match_score", 0) >= 80:
                    results.append(model_info)
                    logger.info(f"Found good match from web search: {model_info['name']} ({model_info['match_score']:.1f}%)")

                # Stop if we have enough good results
                if len(results) >= limit:
                    break

    except Exception as e:
        logger.warning("Web-first search failed: %s", str(e))

    return results


def search_all_platforms(query: str, limit_per_platform: int = 3) -> Dict[str, Any]:
    """
    Search all platforms with web-first strategy.

    Strategy:
    1. First use web search (DuckDuckGo) to find HF/GitHub links
    2. Extract model info from those links
    3. Filter results by match score >= 80%
    4. Fall back to direct API search if needed

    Args:
        query: Model name to search for
        limit_per_platform: Maximum results per platform

    Returns:
        {
            "query": str,
            "total_results": int,
            "platforms": {
                "civitai": [...],
                "huggingface": [...],
                "github": [...]
            }
        }
    """
    import concurrent.futures

    results = {
        "query": query,
        "total_results": 0,
        "platforms": {
            "civitai": [],
            "huggingface": [],
            "github": []
        }
    }

    # Generate search variants
    search_queries = _generate_search_variants(query)
    logger.info(f"Searching with variants: {search_queries}")

    # STEP 1: Web-first search for HF and GitHub (only results with score >= 80%)
    logger.info(f"Starting web-first search for: {query}")
    all_results_by_platform = {"civitai": [], "huggingface": [], "github": []}

    for search_query in search_queries:
        web_results = search_web_first(search_query, limit=10)

        # Separate by platform
        for result in web_results:
            platform = result.get("platform", "")
            if platform == "huggingface":
                all_results_by_platform["huggingface"].append(result)
            elif platform == "github":
                all_results_by_platform["github"].append(result)

        # If we found excellent results (95%+), we can stop
        if any(r.get("match_score", 0) >= 95 for r in web_results):
            logger.info(f"Found excellent web results for: {search_query}")
            break

    # STEP 2: If web search didn't find enough good results, supplement with direct API search
    hf_limit = limit_per_platform * 2
    gh_limit = limit_per_platform * 2
    civitai_limit = limit_per_platform

    # Count good results from web search
    web_good_results = [r for r in (all_results_by_platform["huggingface"] + all_results_by_platform["github"])
                       if r.get("match_score", 0) >= 80]

    # Only do API search if we have < 3 good results from web
    if len(web_good_results) < 3:
        logger.info("Web search found < 3 good results, trying direct API search")

        for search_query in search_queries:
            # Search platforms in parallel with priority limits
            with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                future_hf = executor.submit(search_huggingface, search_query, hf_limit)
                future_gh = executor.submit(search_github, search_query, gh_limit)
                future_civitai = executor.submit(search_civitai, search_query, civitai_limit)

                hf_results = future_hf.result()
                gh_results = future_gh.result()
                civitai_results = future_civitai.result()

                # Filter API results to only keep score >= 80%
                hf_results = [r for r in hf_results if r.get("match_score", 0) >= 80]
                gh_results = [r for r in gh_results if r.get("match_score", 0) >= 80]
                civitai_results = [r for r in civitai_results if r.get("match_score", 0) >= 80]

                # Apply platform priority bonus to scores
                for r in hf_results:
                    r["match_score"] = min(100.0, r.get("match_score", 0) + 5)
                    r["match_level"] = f"{r.get('match_level', '')} [API+HF Priority]"

                for r in gh_results:
                    r["match_score"] = min(100.0, r.get("match_score", 0) + 3)
                    r["match_level"] = f"{r.get('match_level', '')} [API+GH Priority]"

                # Accumulate results
                all_results_by_platform["huggingface"].extend(hf_results)
                all_results_by_platform["github"].extend(gh_results)
                all_results_by_platform["civitai"].extend(civitai_results)

            # Check if we now have enough good results
            all_good_results = [r for r in (all_results_by_platform["huggingface"] + all_results_by_platform["github"])
                               if r.get("match_score", 0) >= 80]
            if len(all_good_results) >= 5:
                logger.info(f"Found enough good results (>= 80%) with query: {search_query}")
                break
    else:
        logger.info(f"Web search found {len(web_good_results)} good results, skipping API search")

    # Deduplicate results by URL and sort by score
    # IMPORTANT: Only keep results with score >= 80%
    def deduplicate_and_filter(results_list, max_results, min_score=80):
        seen_urls = set()
        unique = []
        for r in sorted(results_list, key=lambda x: x.get("match_score", 0), reverse=True):
            score = r.get("match_score", 0)
            url = r.get("url", "")

            # Filter: only keep results with score >= min_score
            if score < min_score:
                continue

            if url and url not in seen_urls:
                seen_urls.add(url)
                unique.append(r)
        return unique[:max_results]

    # Filter all results to only keep score >= 80%
    results["platforms"]["huggingface"] = deduplicate_and_filter(all_results_by_platform["huggingface"], hf_limit, min_score=80)
    results["platforms"]["github"] = deduplicate_and_filter(all_results_by_platform["github"], gh_limit, min_score=80)
    results["platforms"]["civitai"] = deduplicate_and_filter(all_results_by_platform["civitai"], civitai_limit, min_score=80)

    # Combine all results with priority order: HF first, then GitHub, then CivitAI
    all_results = []
    all_results.extend(results["platforms"]["huggingface"])
    all_results.extend(results["platforms"]["github"])
    all_results.extend(results["platforms"]["civitai"])

    # Log filtering results
    logger.info(f"After filtering (score >= 80%): {len(all_results)} results total")
    logger.info(f"  HuggingFace: {len(results['platforms']['huggingface'])}")
    logger.info(f"  GitHub: {len(results['platforms']['github'])}")
    logger.info(f"  CivitAI: {len(results['platforms']['civitai'])}")

    # Sort globally by match score (already filtered to >= 80%)
    all_results.sort(key=lambda x: x.get("match_score", 0), reverse=True)

    results["total_results"] = len(all_results)
    results["sorted_results"] = all_results  # Add globally sorted results

    # Add Google search suggestion URL
    results["google_search_url"] = f"https://www.google.com/search?q={quote(query)}+download+safetensors+OR+ckpt"

    return results
