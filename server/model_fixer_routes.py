"""
Model fixer routes for missing model repair and fingerprint cache.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import threading
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from aiohttp import web

import folder_paths
from server import PromptServer

from .project_store import read_json, safe_under_output, write_json_atomic
from .route_utils import json_error, require_json, basename, parse_json_body

logger = logging.getLogger(__name__)

# Lock to prevent concurrent fingerprint cache builds
_fingerprint_cache_lock = threading.Lock()

MAX_MISSING = 200
MAX_CANDIDATES = 10
FINGERPRINT_SCHEMA = 1

# Stopwords and patterns for candidate scoring
_STOPWORDS = {"model", "checkpoint", "ckpt", "lora", "vae", "clip", "unet", "diffusion", "stable", "sd", "comfyui"}
_EXT_RE = re.compile(r"\.(safetensors|ckpt|pt|pth|bin)$", re.IGNORECASE)
_BRACKETS_RE = re.compile(r"[\[\(\{].*?[\]\)\}]", re.IGNORECASE)

ALL_MODEL_KINDS = [
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "text_encoders",
    "clip",
    "clip_vision",
    "controlnet",
    "upscale_models",
    "embeddings",
    "unet",
]

TYPE_HINT_MAP = {
    "checkpoint": ["checkpoints", "diffusion_models"],
    "lora": ["loras"],
    "vae": ["vae"],
}


def _basename_no_ext(value: str) -> str:
    base = basename(value)
    if "." in base:
        return base.rsplit(".", 1)[0]
    return base


def _normalize_for_match(value: str) -> str:
    """Normalize a model name for matching by removing extensions, brackets, and special characters."""
    s = basename(value).lower()
    s = _EXT_RE.sub("", s)
    s = _BRACKETS_RE.sub(" ", s)
    s = re.sub(r"[-_\.]+", " ", s)
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _list_kind_files(kind: str) -> List[str]:
    try:
        return list(folder_paths.get_filename_list(kind))
    except Exception as e:
        logger.warning("Failed to list models for kind '%s': %s", kind, e)
        return []


def _candidate_score(base: str, candidate: str) -> Tuple[int, str]:
    """
    Improved scoring using token-based overlap, fuzzy matching, and normalization.

    Returns:
        Tuple of (score 0-100, reason string)
    """
    # Exact match on original strings is the highest score
    if base and candidate and base == candidate:
        return 100, "exact_basename"

    # Normalize both strings for robust comparison
    base_norm = _normalize_for_match(base)
    cand_norm = _normalize_for_match(candidate)
    
    # Don't match if the query is too short and non-specific
    if len(base_norm) < 4:
        return 0, "query_too_short"

    # Exact match after normalization is also a perfect score
    if base_norm == cand_norm:
        return 100, "exact_normalized"

    # Tokenize and filter stopwords for smarter matching
    base_tokens = set(w for w in base_norm.split() if w not in _STOPWORDS and len(w) > 1)
    cand_tokens = set(w for w in cand_norm.split() if w not in _STOPWORDS and len(w) > 1)

    # If no meaningful tokens, fall back to simple fuzzy matching
    if not base_tokens or not cand_tokens:
        ratio = SequenceMatcher(None, base_norm, cand_norm).ratio()
        return int(ratio * 80), "fuzzy_fallback" # Scale to 80 to leave room for better matches

    # Token subset scoring (very strong signal)
    # If all query tokens are in the candidate, it's a great match.
    if base_tokens.issubset(cand_tokens):
        # The score is penalized by the number of extra words to prefer tighter matches
        extra_words = len(cand_tokens - base_tokens)
        score = max(80, 98 - extra_words * 3) # High base score, slight penalty
        return int(score), "token_subset"

    # Jaccard similarity (measures token overlap)
    intersection = len(base_tokens & cand_tokens)
    union = len(base_tokens | cand_tokens)
    jaccard = intersection / union if union > 0 else 0

    # Fuzzy matching on normalized strings (good for typos)
    fuzzy_ratio = SequenceMatcher(None, base_norm, cand_norm).ratio()

    # Substring bonus (rewards partial but contiguous matches)
    substring_bonus = 0
    if len(base_norm) > 5 and (base_norm in cand_norm or cand_norm in base_norm):
        substring_bonus = 10

    # Combine scores with weights: Jaccard is the strongest signal for semantic match,
    # fuzzy for typos.
    # Weighted average: Jaccard 60%, Fuzzy 30%, Substring Bonus 10%
    combined_score = (jaccard * 60) + (fuzzy_ratio * 30) + substring_bonus
    
    reason = f"hybrid (j:{jaccard:.2f}, f:{fuzzy_ratio:.2f})"
    
    return int(min(combined_score, 95)), reason # Cap at 95 to distinguish from subset matches


def _fingerprint_cache_path() -> Path:
    return safe_under_output("PROJECTS/_INDEX/model_fingerprints.json")


def _load_fingerprint_cache() -> Dict[str, Any]:
    path = _fingerprint_cache_path()
    data = read_json(path, {}, strict=False)
    if not isinstance(data, dict) or data.get("schema") != FINGERPRINT_SCHEMA:
        return {"schema": FINGERPRINT_SCHEMA, "updated_at": "", "items": []}
    items = data.get("items")
    if not isinstance(items, list):
        items = []
    return {
        "schema": FINGERPRINT_SCHEMA,
        "updated_at": str(data.get("updated_at") or ""),
        "items": items,
    }


def _hash_file(path: Path) -> str:
    size = path.stat().st_size
    hash_obj = hashlib.sha256()
    with path.open("rb") as handle:
        if size < 2 * 1024 * 1024:
            hash_obj.update(handle.read())
        else:
            head = handle.read(1024 * 1024)
            hash_obj.update(head)
            if size > 1024 * 1024:
                handle.seek(max(size - 1024 * 1024, 0))
                hash_obj.update(handle.read(1024 * 1024))
    hash_obj.update(str(size).encode("ascii"))
    return hash_obj.hexdigest()


def _build_fingerprint_cache(kinds: Iterable[str], force: bool) -> Dict[str, Any]:
    """
    Build fingerprint cache with thread safety.
    Uses a lock to prevent concurrent cache builds that could conflict.
    """
    with _fingerprint_cache_lock:
        cache = _load_fingerprint_cache()
        existing: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for item in cache.get("items") or []:
            kind = item.get("kind")
            relpath = item.get("relpath")
            if isinstance(kind, str) and isinstance(relpath, str):
                existing[(kind, relpath)] = item

        items = []
        hashed = 0
        reused = 0
        total = 0

        for kind in kinds:
            for relpath in _list_kind_files(kind):
                total += 1
                full_path = folder_paths.get_full_path(kind, relpath)
                if not full_path:
                    continue
                try:
                    stat = os.stat(full_path)
                    size = int(stat.st_size)
                    mtime = float(stat.st_mtime)
                except Exception as e:
                    logger.warning("Failed to stat %s: %s", full_path, e)
                    continue

                key = (kind, relpath)
                prev = existing.get(key)
                if (
                    not force
                    and prev
                    and prev.get("size") == size
                    and prev.get("mtime") == mtime
                    and prev.get("fingerprint")
                ):
                    fingerprint = prev.get("fingerprint")
                    reused += 1
                else:
                    try:
                        fingerprint = _hash_file(Path(full_path))
                    except Exception as e:
                        logger.warning("Failed to hash %s: %s", full_path, e)
                        continue
                    hashed += 1

                items.append(
                    {
                        "kind": kind,
                        "relpath": relpath,
                        "size": size,
                        "mtime": mtime,
                        "fingerprint": fingerprint,
                    }
                )

        updated_at = datetime.now().isoformat()
        payload = {"schema": FINGERPRINT_SCHEMA, "updated_at": updated_at, "items": items}
        path = _fingerprint_cache_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        write_json_atomic(path, payload)
        return {
            "count": len(items),
            "hashed": hashed,
            "reused": reused,
            "total": total,
            "updated_at": updated_at,
        }


@PromptServer.instance.routes.post("/mjr_models/scan_candidates")
async def mjr_models_scan_candidates(request: web.Request) -> web.Response:
    """Scan for candidate model files that match missing models."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    raw_missing = body.get("missing")
    if not isinstance(raw_missing, list):
        return json_error("missing must be a list")
    if len(raw_missing) > MAX_MISSING:
        return json_error(f"missing exceeds limit ({MAX_MISSING})")

    kinds_cache: Dict[str, List[str]] = {}

    def get_kind_list(kind: str) -> List[str]:
        if kind not in kinds_cache:
            kinds_cache[kind] = _list_kind_files(kind)
        return kinds_cache[kind]

    # Import TYPE_HINT_KIND from model_downloader_routes
    from .model_downloader_routes import TYPE_HINT_KIND

    results = []
    for entry in raw_missing:
        missing_value = str((entry or {}).get("missing_value") or "").strip()
        type_hint = str((entry or {}).get("type_hint") or "unknown").strip().lower()
        # Convert type_hint to expected_kind if not provided
        expected_kind = str((entry or {}).get("expected_kind") or "").strip()
        if not expected_kind and type_hint:
            expected_kind = TYPE_HINT_KIND.get(type_hint, "")

        if not missing_value:
            results.append(
                {"missing_value": missing_value, "type_hint": type_hint, "candidates": []}
            )
            continue

        base = basename(missing_value)
        base_no_ext = _basename_no_ext(missing_value)
        search_kinds = TYPE_HINT_MAP.get(type_hint) or ALL_MODEL_KINDS

        candidates = []
        seen = set()
        exact_match_wrong_folder = None

        for kind in search_kinds:
            for relpath in get_kind_list(kind):
                if (kind, relpath) in seen:
                    continue
                seen.add((kind, relpath))
                cand_base = basename(relpath)
                cand_base_no_ext = _basename_no_ext(relpath)
                score, reason = _candidate_score(base, cand_base)

                # Check if exact match but in wrong folder
                in_wrong_folder = False
                if score == 100 and expected_kind and kind != expected_kind:
                    in_wrong_folder = True
                    reason = "wrong_folder"
                    if exact_match_wrong_folder is None:
                        exact_match_wrong_folder = {
                            "kind": kind,
                            "relpath": relpath,
                            "basename": cand_base,
                            "score": score,
                            "reason": reason,
                            "expected_kind": expected_kind,
                        }

                candidates.append(
                    {
                        "kind": kind,
                        "relpath": relpath,
                        "basename": cand_base,
                        "score": score,
                        "reason": reason,
                        "in_wrong_folder": in_wrong_folder,
                        "expected_kind": expected_kind if in_wrong_folder else None,
                    }
                )

        candidates.sort(key=lambda c: c.get("score", 0), reverse=True)
        results.append(
            {
                "missing_value": missing_value,
                "type_hint": type_hint,
                "candidates": candidates[:MAX_CANDIDATES],
                "exact_match_wrong_folder": exact_match_wrong_folder,
            }
        )

    return web.json_response({"ok": True, "results": results})


@PromptServer.instance.routes.post("/mjr_models/build_fingerprint_cache")
async def mjr_models_build_fingerprint_cache(request: web.Request) -> web.Response:
    """Build or rebuild the model fingerprint cache for file matching."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    raw_kinds = body.get("kinds")
    force = bool(body.get("force", False))

    kinds = ALL_MODEL_KINDS
    if raw_kinds is not None:
        if not isinstance(raw_kinds, list):
            return json_error("kinds must be a list")
        filtered = [str(k) for k in raw_kinds if str(k) in ALL_MODEL_KINDS]
        if not filtered:
            return json_error("kinds contains no supported entries")
        kinds = filtered

    try:
        result = await asyncio.to_thread(_build_fingerprint_cache, kinds, force)
    except (OSError, IOError) as e:
        logger.error("Fingerprint cache build failed (I/O error): %s", e)
        return json_error(f"fingerprint cache build failed: {e}", status=500)
    except ValueError as e:
        logger.error("Fingerprint cache build failed (invalid data): %s", e)
        return json_error(f"invalid fingerprint data: {e}", status=400)

    return web.json_response({"ok": True, **result})


@PromptServer.instance.routes.get("/mjr_models/fingerprint_cache_status")
async def mjr_models_fingerprint_cache_status(request: web.Request) -> web.Response:
    """Get fingerprint cache statistics."""
    cache = _load_fingerprint_cache()
    items = cache.get("items") or []
    return web.json_response(
        {"ok": True, "count": len(items), "updated_at": cache.get("updated_at", "")}
    )


@PromptServer.instance.routes.post("/mjr_models/resolve_by_fingerprint")
async def mjr_models_resolve_by_fingerprint(request: web.Request) -> web.Response:
    """Resolve missing models by comparing file fingerprints."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    kind = str(body.get("kind") or "").strip()
    fingerprint = str(body.get("fingerprint") or "").strip()
    if not kind:
        return json_error("kind is required")
    if not fingerprint:
        return json_error("fingerprint is required")

    cache = _load_fingerprint_cache()
    for item in cache.get("items") or []:
        if item.get("kind") == kind and item.get("fingerprint") == fingerprint:
            return web.json_response({"ok": True, "relpath": item.get("relpath")})

    return web.json_response({"ok": True, "relpath": None})


@PromptServer.instance.routes.post("/mjr_models/move_to_correct_folder")
async def mjr_models_move_to_correct_folder(request: web.Request) -> web.Response:
    """Move a model file from one folder to the correct folder."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    source_kind = str(body.get("source_kind") or "").strip()
    source_relpath = str(body.get("source_relpath") or "").strip()
    target_kind = str(body.get("target_kind") or "").strip()

    if not source_kind:
        return json_error("source_kind is required")
    if not source_relpath:
        return json_error("source_relpath is required")
    if not target_kind:
        return json_error("target_kind is required")
    if source_kind not in ALL_MODEL_KINDS:
        return json_error(f"invalid source_kind: {source_kind}")
    if target_kind not in ALL_MODEL_KINDS:
        return json_error(f"invalid target_kind: {target_kind}")

    # Get source file path
    source_path = folder_paths.get_full_path(source_kind, source_relpath)
    if not source_path or not os.path.exists(source_path):
        return json_error("source file not found", status=404)

    # Get target folder
    try:
        target_folders = folder_paths.get_folder_paths(target_kind)
        if not target_folders:
            return json_error(f"no folder configured for kind: {target_kind}", status=500)
        target_folder = Path(target_folders[0])
    except Exception as e:
        logger.error("Failed to get target folder for kind '%s': %s", target_kind, e)
        return json_error(f"failed to get target folder: {e}", status=500)

    # Ensure target folder exists
    try:
        target_folder.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error("Failed to create target folder %s: %s", target_folder, e)
        return json_error(f"failed to create target folder: {e}", status=500)

    # Compute target path (preserve subfolder structure if any)
    source_basename = basename(source_relpath)
    target_path = target_folder / source_basename

    # Check if target already exists
    if target_path.exists():
        return json_error(f"target file already exists: {target_path}", status=409)

    # Move the file
    try:
        import shutil
        shutil.move(str(source_path), str(target_path))
        logger.info("Moved model from %s (%s) to %s (%s)", source_relpath, source_kind, target_path, target_kind)
    except Exception as e:
        logger.error("Failed to move file from %s to %s: %s", source_path, target_path, e)
        return json_error(f"failed to move file: {e}", status=500)

    return web.json_response({
        "ok": True,
        "source_path": str(source_path),
        "target_path": str(target_path),
        "target_relpath": source_basename,
    })
