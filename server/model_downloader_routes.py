"""
Model download routes with recipe support and progress tracking.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from aiohttp import web

import folder_paths
from server import PromptServer

from .model_sources_store import resolve_recipes, save_recipes
from .route_utils import json_error, require_json, basename, parse_json_body
from .model_search_api import search_all_platforms

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".pth", ".bin"}
MAX_MISSING = 200
MAX_ITEMS = 50
# Increased default timeout to 5 minutes for large model downloads
DOWNLOAD_TIMEOUT = int(os.environ.get("MJR_MODEL_DOWNLOAD_TIMEOUT", "300"))
DEFAULT_MAX_DOWNLOAD_BYTES = 50 * 1024**3
CHUNK_SIZE = 1024 * 1024

VALID_KINDS = {
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "controlnet",
    "text_encoders",
    "clip",
    "clip_vision",
    "unet",
    "upscale_models",
    "embeddings",
}

KIND_ALIASES = {
    "checkpoint": "checkpoints",
    "ckpt": "checkpoints",
    "lora": "loras",
    "text_encoder": "text_encoders",
    "text_encoders": "text_encoders",
    "diffusion": "diffusion_models",
}

TYPE_HINT_KIND = {
    "checkpoint": "checkpoints",
    "diffusion": "diffusion_models",
    "diffusion_models": "diffusion_models",
    "lora": "loras",
    "vae": "vae",
    "controlnet": "controlnet",
    "upscale_models": "upscale_models",
    "clip": "clip",
    "clip_vision": "clip_vision",
    "text_encoder": "text_encoders",
    "text_encoders": "text_encoders",
    "unet": "unet",
    "embeddings": "embeddings",
    "unknown": "",
}

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
JOB_CLEANUP_HOURS = int(os.environ.get("MJR_JOB_CLEANUP_HOURS", "1"))


def _sanitize_error_message(message: str, item: Dict[str, Any]) -> str:
    """
    Sanitize error messages to avoid exposing authentication tokens in logs.

    Args:
        message: The error message
        item: The download item that may contain a token

    Returns:
        Sanitized error message with token replaced by [REDACTED]
    """
    token = item.get("token", "")
    if token and token in message:
        return message.replace(token, "[REDACTED]")
    return message


def _normalize_kind(kind: str) -> Optional[str]:
    k = str(kind or "").strip().lower()
    if k in KIND_ALIASES:
        k = KIND_ALIASES[k]
    if k in VALID_KINDS:
        return k
    return None


def _is_valid_sha256(value: str) -> bool:
    if not value:
        return False
    value = value.strip().lower()
    if len(value) != 64:
        return False
    return all(c in "0123456789abcdef" for c in value)


def _validate_url(url: str) -> Tuple[bool, str]:
    if not url:
        return False, "url is required"
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, "url must start with http or https"
    if not parsed.netloc:
        return False, "url must include a host"
    return True, ""


def _extract_filename(url: str, filename: str) -> str:
    if filename:
        return str(filename).strip()
    parsed = urlparse(url)
    return basename(parsed.path)


def _validate_filename(filename: str) -> Tuple[bool, str]:
    if not filename:
        return False, "filename is required"
    if "/" in filename or "\\" in filename or ":" in filename:
        return False, "filename must be a basename"
    if ".." in filename:
        return False, "filename contains invalid path"
    _, ext = os.path.splitext(filename)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return False, f"unsupported extension '{ext or ''}'"
    return True, ""


def _models_root() -> Path:
    root = getattr(folder_paths, "models_dir", None)
    if root:
        return Path(root)
    for kind in ("checkpoints", "loras", "vae"):
        try:
            paths = folder_paths.get_folder_paths(kind)
        except Exception:
            paths = []
        if paths:
            return Path(paths[0]).parent
    try:
        base = folder_paths.get_base_path()
        return Path(base) / "models"
    except Exception:
        return Path.cwd() / "models"


def _settings_path() -> Path:
    return Path(folder_paths.get_user_directory()) / "default" / "comfy.settings.json"


def _load_settings() -> Dict[str, Any]:
    path = _settings_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _get_max_download_bytes() -> int:
    env_bytes = os.environ.get("MJR_MODEL_DOWNLOAD_MAX_BYTES")
    env_gb = os.environ.get("MJR_MODEL_DOWNLOAD_MAX_GB")
    if env_bytes:
        try:
            value = int(env_bytes)
            if value > 0:
                return value
        except ValueError:
            pass
    if env_gb:
        try:
            value = float(env_gb)
            if value > 0:
                return int(value * 1024**3)
        except ValueError:
            pass

    settings = _load_settings()
    for key in ("mjr_project.download_max_bytes", "Majoor.ProjectSettings.DownloadMaxBytes"):
        raw = settings.get(key)
        try:
            value = int(raw)
            if value > 0:
                return value
        except Exception:
            continue
    for key in ("mjr_project.download_max_gb", "Majoor.ProjectSettings.DownloadMaxGB"):
        raw = settings.get(key)
        try:
            value = float(raw)
            if value > 0:
                return int(value * 1024**3)
        except Exception:
            continue

    return DEFAULT_MAX_DOWNLOAD_BYTES


def _temp_dir(job_id: str) -> Path:
    return _models_root() / ".mjr_tmp" / job_id


def _resolve_target_dir(kind: str) -> Optional[Path]:
    def select_path(paths: List[str], target: str) -> Optional[Path]:
        if not paths:
            return None
        target_lower = target.lower()
        for path in paths:
            if not path:
                continue
            if Path(path).name.lower() == target_lower:
                return Path(path)
        for path in paths:
            if not path:
                continue
            norm = str(path).replace("\\", "/").lower()
            if f"/{target_lower}" in norm:
                return Path(path)
        return Path(paths[0])

    if kind == "clip":
        try:
            paths = folder_paths.get_folder_paths("text_encoders")
        except Exception:
            paths = []
        selected = select_path(paths, "clip")
        if selected:
            return selected
    try:
        paths = folder_paths.get_folder_paths(kind)
    except Exception:
        paths = []
    selected = select_path(paths, kind)
    if selected:
        return selected
    root = _models_root()
    fallback = root / kind
    if fallback.exists():
        return fallback
    if kind == "controlnet":
        return root / "controlnet"
    if kind in VALID_KINDS:
        return fallback
    return None


def _init_job(job_id: str) -> None:
    with _jobs_lock:
        _jobs[job_id] = {
            "state": "queued",
            "progress": {"current": 0, "total": 0, "pct": 0},
            "message": "",
            "created_at": datetime.now().isoformat(),
            "summary": {"downloaded": 0, "errors": 0},
        }


def _update_job(job_id: str, **kwargs) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        for key, value in kwargs.items():
            job[key] = value


def _get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        return dict(job)


def _cleanup_old_jobs() -> int:
    """Remove jobs older than JOB_CLEANUP_HOURS from memory. Returns count of removed jobs."""
    from datetime import timedelta

    now = datetime.now()
    cutoff = now - timedelta(hours=JOB_CLEANUP_HOURS)
    removed = 0

    with _jobs_lock:
        jobs_to_remove = []
        for job_id, job in _jobs.items():
            created_str = job.get("created_at", "")
            if not created_str:
                continue
            try:
                created = datetime.fromisoformat(created_str)
                if created < cutoff:
                    jobs_to_remove.append(job_id)
            except (ValueError, TypeError):
                # If we can't parse the date, keep the job to be safe
                continue

        for job_id in jobs_to_remove:
            del _jobs[job_id]
            removed += 1

    if removed:
        logger.info("Cleaned up %d old download jobs", removed)
    return removed


def _prepare_headers(url: str, token: str | None) -> Dict[str, str]:
    headers = {"User-Agent": "ComfyUI-Majoor-Downloader"}
    if not token:
        token = (
            os.environ.get("HUGGINGFACE_HUB_TOKEN")
            or os.environ.get("HF_TOKEN")
            or os.environ.get("HUGGINGFACE_TOKEN")
        )
    if not token:
        return headers
    host = urlparse(url).netloc.lower()
    if (
        "huggingface.co" in host
        or "huggingfaceusercontent.com" in host
        or host.endswith("hf.co")
    ):
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _download_single(
    job_id: str, item: Dict[str, Any], index: int, total_items: int
) -> Dict[str, Any]:
    key = item["key"]
    url = item["url"]
    filename = item["filename"]
    kind = item["kind"]
    sha256_expected = item.get("sha256")

    target_dir = _resolve_target_dir(kind)
    if not target_dir:
        raise ValueError(f"no target folder for kind '{kind}'")
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / filename
    if target_path.exists():
        return {
            "key": key,
            "filename": filename,
            "status": "skipped",
            "reason": "exists",
            "path": str(target_path),
        }

    tmp_dir = _temp_dir(job_id)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / f"{filename}.part"
    if tmp_path.exists():
        try:
            tmp_path.unlink()
        except Exception:
            pass

    token = item.get("token") or ""
    headers = _prepare_headers(url, token)
    request = Request(url, headers=headers)
    total = 0
    downloaded = 0
    hasher = hashlib.sha256() if sha256_expected else None

    message = f"{index}/{total_items} downloading {filename}"
    _update_job(job_id, state="downloading", message=message)
    max_bytes = _get_max_download_bytes()

    try:
        with urlopen(request, timeout=DOWNLOAD_TIMEOUT) as resp:
            length = resp.headers.get("Content-Length")
            if length:
                try:
                    total = int(length)
                except ValueError:
                    total = 0
            if total and max_bytes and total > max_bytes:
                raise ValueError("download exceeds size limit")

            with open(tmp_path, "wb") as handle:
                while True:
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    handle.write(chunk)
                    if hasher:
                        hasher.update(chunk)
                    downloaded += len(chunk)
                    if max_bytes and downloaded > max_bytes:
                        raise ValueError("download exceeds size limit")
                    pct = int((downloaded / total) * 100) if total else 0
                    _update_job(
                        job_id,
                        progress={"current": downloaded, "total": total, "pct": pct},
                    )
    except Exception:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except Exception:
                pass
        raise

    if sha256_expected and hasher:
        digest = hasher.hexdigest()
        if digest.lower() != sha256_expected.lower():
            raise ValueError("sha256 mismatch")

    final_tmp = tmp_dir / filename
    os.replace(tmp_path, final_tmp)
    os.replace(final_tmp, target_path)
    logger.info("Downloaded %s to %s", filename, target_path)
    return {"key": key, "filename": filename, "status": "ok", "path": str(target_path)}


def _run_download_job(job_id: str, items: List[Dict[str, Any]]) -> None:
    downloaded = 0
    errors = 0
    skipped = 0
    results = []
    total_items = len(items)

    for index, item in enumerate(items, start=1):
        try:
            result = _download_single(job_id, item, index, total_items)
            results.append(result)
            if result.get("status") == "ok":
                downloaded += 1
            elif result.get("status") == "skipped":
                skipped += 1
        except Exception as e:
            error_msg = _sanitize_error_message(str(e), item)
            logger.warning("Download failed for %s: %s", item.get("key"), error_msg)
            results.append(
                {
                    "key": item.get("key", ""),
                    "filename": item.get("filename", ""),
                    "status": "error",
                    "error": error_msg,
                }
            )
            errors += 1

    summary = {"downloaded": downloaded, "errors": errors, "skipped": skipped}
    state = "done" if errors == 0 else "error"
    message = f"Downloaded {downloaded}, skipped {skipped}, errors {errors}"
    _update_job(job_id, state=state, message=message, summary=summary)

    try:
        shutil.rmtree(_temp_dir(job_id), ignore_errors=True)
    except Exception:
        pass

    logger.info("Download job %s finished: %s", job_id, message)


def _validate_item(raw: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], str]:
    key = basename(raw.get("key"))
    url = str(raw.get("url") or "").strip()
    kind = _normalize_kind(raw.get("kind"))
    filename = str(raw.get("filename") or "").strip()
    sha256 = str(raw.get("sha256") or "").strip().lower()
    token = str(raw.get("token") or "").strip()

    if not key:
        return None, "key is required"
    ok, err = _validate_url(url)
    if not ok:
        return None, err
    if not kind:
        return None, "invalid kind"
    filename = _extract_filename(url, filename)
    ok, err = _validate_filename(filename)
    if not ok:
        return None, err
    if sha256 and not _is_valid_sha256(sha256):
        return None, "sha256 must be 64 hex characters"

    return (
        {
            "key": key,
            "kind": kind,
            "url": url,
            "filename": filename,
            "sha256": sha256 or None,
            "token": token or None,
        },
        "",
    )


@PromptServer.instance.routes.post("/mjr_models/resolve_recipes")
async def mjr_models_resolve_recipes(request: web.Request) -> web.Response:
    """Resolve missing models against recipe database with optional auto-search."""
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

    auto_search = body.get("auto_search", False)

    resolved = resolve_recipes(raw_missing)

    # If auto_search is enabled, search online for models without recipes
    if auto_search:
        loop = asyncio.get_running_loop()
        for entry, missing in zip(resolved, raw_missing):
            if entry.get("recipe"):
                continue

            # Extract model name from missing_value
            missing_value = entry.get("missing_value", "")
            if not missing_value:
                continue

            # Search with just the filename
            key = entry.get("key", "")
            if key:
                # Remove extension for better search
                search_query = key.rsplit(".", 1)[0]

                # Search online
                search_results = await loop.run_in_executor(
                    None, search_all_platforms, search_query, 1
                )

                # Use first result if available
                all_results = []
                for platform_results in search_results.get("platforms", {}).values():
                    all_results.extend(platform_results)

                if all_results:
                    best_result = all_results[0]
                    entry["auto_search_result"] = best_result
                    entry["kind"] = best_result.get("type", "")
    else:
        for entry, missing in zip(resolved, raw_missing):
            if entry.get("recipe"):
                continue
            hint = str((missing or {}).get("type_hint") or "").lower()
            kind = TYPE_HINT_KIND.get(hint, "")
            entry["kind"] = kind

    return web.json_response({"ok": True, "resolved": resolved})


@PromptServer.instance.routes.post("/mjr_models/save_recipes")
async def mjr_models_save_recipes(request: web.Request) -> web.Response:
    """Save model download recipes to the database."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    raw_items = body.get("items")
    if not isinstance(raw_items, list):
        return json_error("items must be a list")
    if len(raw_items) > MAX_ITEMS:
        return json_error("too many items")

    items = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            return json_error("invalid item in items")
        item, err = _validate_item(raw)
        if err:
            return json_error(err)
        item.pop("token", None)
        items.append(item)

    save_recipes(items)
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/mjr_models/download")
async def mjr_models_download(request: web.Request) -> web.Response:
    """Start a background download job for model files."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    raw_items = body.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return json_error("items must be a non-empty list")
    if len(raw_items) > MAX_ITEMS:
        return json_error("too many items")

    items = []
    seen = set()
    for raw in raw_items:
        if not isinstance(raw, dict):
            return json_error("invalid item in items")
        item, err = _validate_item(raw)
        if err:
            return json_error(err)
        if item["key"] in seen:
            continue
        seen.add(item["key"])
        items.append(item)

    # Clean up old jobs before creating new one
    _cleanup_old_jobs()

    job_id = uuid.uuid4().hex
    _init_job(job_id)

    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, _run_download_job, job_id, items)

    return web.json_response({"ok": True, "job_id": job_id})


@PromptServer.instance.routes.get("/mjr_models/download_status")
async def mjr_models_download_status(request: web.Request) -> web.Response:
    """Get the status of a download job."""
    job_id = (request.query.get("job_id") or "").strip()
    if not job_id:
        return json_error("job_id is required")

    job = _get_job(job_id)
    if not job:
        return json_error("job not found", status=404)

    return web.json_response(
        {
            "ok": True,
            "state": job.get("state", "queued"),
            "progress": job.get("progress") or {"current": 0, "total": 0, "pct": 0},
            "message": job.get("message", ""),
            "summary": job.get("summary") or {"downloaded": 0, "errors": 0},
        }
    )


@PromptServer.instance.routes.post("/mjr_models/search_online")
async def mjr_models_search_online(request: web.Request) -> web.Response:
    """Search for models on CivitAI, Hugging Face, and GitHub."""
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    query = str(body.get("query") or "").strip()
    if not query:
        return json_error("query is required")

    if len(query) < 2:
        return json_error("query must be at least 2 characters")

    limit = body.get("limit", 3)
    try:
        limit = int(limit)
        if limit < 1 or limit > 10:
            limit = 3
    except (ValueError, TypeError):
        limit = 3

    # Run search in thread pool to avoid blocking
    loop = asyncio.get_running_loop()
    results = await loop.run_in_executor(None, search_all_platforms, query, limit)

    return web.json_response({"ok": True, "results": results})
