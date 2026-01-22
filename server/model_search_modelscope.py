"""
ModelScope API integration for model search.
ModelScope (Alibaba Cloud) hosts many Chinese and international models.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

logger = logging.getLogger(__name__)

MODELSCOPE_API_BASE = "https://www.modelscope.cn/api/v1"
MODELSCOPE_TIMEOUT = 30


def search_modelscope(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Search for models on ModelScope (Alibaba Cloud).

    Args:
        query: Model name to search for
        limit: Maximum number of results

    Returns:
        List of results matching standard format
    """
    results = []

    try:
        # ModelScope search API
        params = {
            "keyword": query,
            "page": 1,
            "size": min(limit * 2, 20),  # Get extra to filter
            "sort": "downloads",  # Most downloaded first
        }

        url = f"{MODELSCOPE_API_BASE}/models?{urlencode(params)}"

        headers = {
            "User-Agent": "ComfyUI-Majoor-Downloader",
            "Accept": "application/json"
        }

        request = Request(url, headers=headers)
        with urlopen(request, timeout=MODELSCOPE_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        models = data.get("data", {}).get("models", [])

        for model in models[:limit * 2]:  # Get extras for filtering
            model_id = model.get("id", "")
            model_name = model.get("name", "")
            author = model.get("author", {})
            author_name = author.get("name", "") if isinstance(author, dict) else str(author)

            if not model_name or not author_name:
                continue

            # Get model files
            files_url = f"{MODELSCOPE_API_BASE}/models/{author_name}/{model_name}/files"
            try:
                files_request = Request(files_url, headers=headers)
                with urlopen(files_request, timeout=MODELSCOPE_TIMEOUT) as files_resp:
                    files_data = json.loads(files_resp.read().decode("utf-8"))

                files = files_data.get("data", {}).get("files", [])

                # Find model files
                for file_info in files:
                    filename = file_info.get("name", "")

                    if not filename.endswith((".safetensors", ".ckpt", ".pt", ".bin")):
                        continue

                    # Construct download URL
                    download_url = file_info.get("url", "")
                    if not download_url:
                        # Construct from pattern
                        download_url = f"https://www.modelscope.cn/models/{author_name}/{model_name}/resolve/master/{filename}"

                    # Calculate match score
                    from .model_search_api import calculate_match_score
                    full_name = f"{author_name}/{model_name}"
                    score, match_level = calculate_match_score(query, full_name, filename)

                    if score < 80:
                        continue

                    # Guess type from tags and filename
                    tags = model.get("tags", []) or []
                    tags_lower = [str(t).lower() for t in tags] + [filename.lower()]

                    kind = "checkpoints"
                    if any("lora" in t for t in tags_lower):
                        kind = "loras"
                    elif any("vae" in t for t in tags_lower):
                        kind = "vae"
                    elif any("controlnet" in t for t in tags_lower):
                        kind = "controlnet"
                    elif any("clip" in t for t in tags_lower):
                        kind = "clip"

                    results.append({
                        "platform": "modelscope",
                        "name": full_name,
                        "filename": filename,
                        "url": download_url,
                        "page_url": f"https://www.modelscope.cn/models/{author_name}/{model_name}",
                        "type": kind,
                        "version": "master",
                        "size_mb": int(file_info.get("size", 0) / (1024 * 1024)),
                        "sha256": file_info.get("sha256"),
                        "match_score": score,
                        "match_level": match_level,
                        "downloads": model.get("downloads", 0),
                    })

            except Exception as e:
                logger.debug(f"Failed to get files for {model_name}: {e}")
                continue

    except Exception as e:
        logger.error(f"ModelScope search failed: {e}")

    # Sort by match score
    results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
    return results[:limit]
