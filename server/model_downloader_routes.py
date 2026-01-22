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
import socket
import stat
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime
from ipaddress import ip_address
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from aiohttp import web

import folder_paths
from server import PromptServer

from .model_sources_store import resolve_recipes, save_recipes
from .audit_logger import audit_logger
from .route_utils import (
    basename,
    json_error,
    parse_json_body,
    require_json,
    require_same_origin,
    require_auth,
    require_rate_limit,
)
from .model_search_api import search_all_platforms

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".safetensors", ".ckpt", ".pt", ".pth", ".bin"}
MAX_MISSING = 200
MAX_ITEMS = 50
# Increased default timeout to 5 minutes for large model downloads
DOWNLOAD_TIMEOUT = int(os.environ.get("MJR_MODEL_DOWNLOAD_TIMEOUT", "300"))
DEFAULT_MAX_DOWNLOAD_BYTES = 10 * 1024**3
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

# Default allowlist for common model hosting sites
# Note: download_allow_any_host is now True by default, so this list is mainly for reference
DEFAULT_ALLOWED_HOSTS = {
    "huggingface.co",
    "huggingfaceusercontent.com",
    "hf.co",
    "civitai.com",
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "modelscope.cn",
    "cdn.modelscope.cn",
    "kaggle.com",
    "storage.googleapis.com",
    "download.pytorch.org",
    "openaipublic.azureedge.net",
    "dl.fbaipublicfiles.com",
}

DEFAULT_BLOCK_PRIVATE_IPS = True


def _get_setting_bool(keys: tuple[str, ...], default: bool) -> bool:
    settings = _load_settings()
    for key in keys:
        raw = settings.get(key)
        if raw is None:
            continue
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, (int, float)):
            return bool(raw)
        if isinstance(raw, str):
            v = raw.strip().lower()
            if v in ("1", "true", "yes", "on"):
                return True
            if v in ("0", "false", "no", "off"):
                return False
    return default


def _host_is(hostname: str, base: str) -> bool:
    host = (hostname or "").strip(".").lower()
    base = (base or "").strip(".").lower()
    return host == base or host.endswith(f".{base}")


def _parse_allowed_hosts() -> set[str]:
    env = (os.environ.get("MJR_MODEL_DOWNLOAD_ALLOWED_HOSTS") or "").strip()
    if not env:
        return set(DEFAULT_ALLOWED_HOSTS)
    parts = [p.strip().lower().strip(".") for p in env.split(",")]
    return {p for p in parts if p}


def _canonicalize_download_url(url: str) -> str:
    """
    Canonicalize known non-download URLs into direct download URLs.

    Currently:
    - Hugging Face blob URLs -> resolve URLs
      https://huggingface.co/<owner>/<repo>/blob/<rev>/<path>
      -> https://huggingface.co/<owner>/<repo>/resolve/<rev>/<path>
    """
    s = str(url or "").strip()
    if not s:
        return s
    try:
        parsed = urlparse(s)
    except Exception:
        return s

    host = (parsed.hostname or "").strip(".").lower()
    if host and _host_is(host, "huggingface.co"):
        # Replace first occurrence of /blob/ with /resolve/ while preserving everything else.
        path = parsed.path or ""
        if "/blob/" in path:
            return s.replace("/blob/", "/resolve/", 1)
    return s


def _is_private_or_local_host(host: str) -> Tuple[bool, str]:
    """
    Best-effort SSRF guard: block localhost/private/link-local/multicast/reserved.
    """
    host = (host or "").strip().strip(".")
    if not host:
        return True, "url must include a host"
    lowered = host.lower()
    if lowered in ("localhost",) or lowered.endswith(".localhost") or lowered.endswith(".local"):
        return True, "local hosts are not allowed"
    try:
        ip = ip_address(host)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return True, "private or local addresses are not allowed"
        return False, ""
    except ValueError:
        pass

    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except Exception:
        return True, "failed to resolve host"

    for info in infos:
        addr = info[4][0]
        try:
            ip = ip_address(addr)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return True, "host resolves to a private/local address"
    return False, ""


class _NoAuthCrossHostRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newreq = super().redirect_request(req, fp, code, msg, headers, newurl)
        if newreq is None:
            return None
        try:
            old_host = urlparse(req.full_url).hostname or ""
            new_host = urlparse(newreq.full_url).hostname or ""
        except Exception:
            old_host, new_host = "", ""
        if old_host and new_host and old_host.lower() != new_host.lower():
            if "Authorization" in newreq.headers:
                del newreq.headers["Authorization"]
        return newreq


def _open_url(request: Request, timeout: int):
    opener = build_opener(_NoAuthCrossHostRedirects())
    return opener.open(request, timeout=timeout)


def _aggressive_move_file(src: Path, dst: Path) -> Tuple[bool, Optional[str]]:
    """
    Aggressively move file using all available methods including Windows APIs.

    Returns:
        (success: bool, error_message: Optional[str])
    """
    src_str = str(src)
    dst_str = str(dst)

    # Strategy 1: Standard os.replace
    try:
        os.replace(src_str, dst_str)
        return True, None
    except Exception as e1:
        pass

    # Strategy 2: shutil.move
    try:
        shutil.move(src_str, dst_str)
        return True, None
    except Exception as e2:
        pass

    # Strategy 3: Copy with explicit permissions, then delete
    try:
        # Remove read-only attribute if exists
        if dst.exists():
            try:
                os.chmod(dst, stat.S_IWRITE)
                dst.unlink()
            except Exception:
                pass

        # Copy with all metadata
        shutil.copy2(src, dst)

        # Make writable
        os.chmod(dst, stat.S_IWRITE | stat.S_IREAD)

        # Remove source
        try:
            os.chmod(src, stat.S_IWRITE)
            src.unlink()
        except Exception:
            pass  # Source cleanup not critical

        return True, None
    except Exception as e3:
        pass

    # Strategy 4: Windows-specific - use subprocess with move command
    if sys.platform == "win32":
        try:
            # Use Windows move command with /Y (overwrite)
            result = subprocess.run(
                ["move", "/Y", src_str, dst_str],
                capture_output=True,
                text=True,
                timeout=30,
                shell=True
            )
            if result.returncode == 0:
                return True, None
        except Exception as e4:
            pass

        # Strategy 5: Try robocopy (more robust on Windows)
        try:
            # Robocopy: copy file then delete source
            src_dir = str(src.parent)
            dst_dir = str(dst.parent)
            filename = src.name

            result = subprocess.run(
                ["robocopy", src_dir, dst_dir, filename, "/MOV", "/R:3", "/W:1"],
                capture_output=True,
                text=True,
                timeout=60,
                shell=True
            )
            # Robocopy returns 0-7 for success (8+ is error)
            if result.returncode < 8:
                return True, None
        except Exception as e5:
            pass

    # All strategies failed
    return False, "All file move strategies failed (permission denied)"


def _sanitize_error_message(message: str, item: Dict[str, Any]) -> str:
    """
    Sanitize error messages to avoid exposing authentication tokens in logs.

    Args:
        message: The error message
        item: The download item that may contain a token

    Returns:
        Sanitized error message with token replaced by [REDACTED]
    """
    msg = str(message or "")
    token = str(item.get("token") or "")
    if token and token in msg:
        msg = msg.replace(token, "[REDACTED]")

    # Redact common patterns in URLs / headers.
    try:
        import re

        msg = re.sub(r"(?i)(authorization:\\s*bearer\\s+)([^\\s]+)", r"\\1[REDACTED]", msg)
        msg = re.sub(r"(?i)(bearer\\s+)([^\\s]+)", r"\\1[REDACTED]", msg)
        msg = re.sub(r"(?i)(access_token|token|api_key|apikey|key)=([^&\\s]+)", r"\\1=[REDACTED]", msg)
    except Exception:
        pass

    return msg


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
    url = _canonicalize_download_url(url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False, "url must start with http or https"
    if not parsed.netloc:
        return False, "url must include a host"
    if parsed.username or parsed.password:
        return False, "url must not include credentials"

    allow_any_public = _get_setting_bool(
        ("mjr_project.download_allow_any_host", "Majoor.ProjectSettings.DownloadAllowAnyHost"),
        True,  # Changed to True to allow all public hosts by default
    )
    allowed_hosts = _parse_allowed_hosts()
    if "*" in allowed_hosts:
        allow_any_public = True
        allowed_hosts.discard("*")
    host = (parsed.hostname or "").strip(".").lower()
    if not allow_any_public:
        if not any(_host_is(host, h) for h in allowed_hosts):
            return False, "host is not allowed"

    requested_block_private = _get_setting_bool(
        (
            "mjr_project.download_block_private_ips",
            "Majoor.ProjectSettings.DownloadBlockPrivateIPs",
        ),
        DEFAULT_BLOCK_PRIVATE_IPS,
    ) and str(os.environ.get("MJR_MODEL_DOWNLOAD_BLOCK_PRIVATE_IPS", "")).strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )

    allow_private = (
        str(os.environ.get("MJR_MODEL_DOWNLOAD_ALLOW_PRIVATE_IPS", "")).strip().lower() in ("1", "true", "yes", "on")
        and (os.environ.get("MJR_INSECURE_ALLOW_PRIVATE_MODEL_DOWNLOADS") or "").strip()
        == "I_UNDERSTAND_SSRF_RISK"
    )

    # SSRF hardening: private/local IP blocks stay enabled unless explicitly acknowledged.
    block_private = requested_block_private or (DEFAULT_BLOCK_PRIVATE_IPS and not allow_private)
    if block_private and not allow_private:
        bad, reason = _is_private_or_local_host(host)
        if bad:
            return False, reason
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
            "summary": {"downloaded": 0, "errors": 0, "skipped": 0},
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
    host = urlparse(url).hostname or ""
    host = host.strip(".").lower()
    if (
        _host_is(host, "huggingface.co")
        or _host_is(host, "huggingfaceusercontent.com")
        or _host_is(host, "hf.co")
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

    # Note: Skipping early permission check as it's unreliable on Windows
    # and aggressive move strategies can often succeed even when os.access reports no permission

    target_path = target_dir / filename

    # Check if file already exists
    if target_path.exists():
        # Check if file is complete by verifying it's not 0 bytes
        try:
            file_size = target_path.stat().st_size
            if file_size > 0:
                return {
                    "key": key,
                    "filename": filename,
                    "status": "skipped",
                    "reason": "exists",
                }
            else:
                # File exists but is empty - try to remove it
                logger.warning(f"Found empty file at {target_path}, attempting to remove")
                try:
                    target_path.unlink()
                except Exception as e:
                    raise ValueError(f"Cannot remove empty/corrupted existing file: {e}")
        except Exception as e:
            logger.error(f"Error checking existing file: {e}")
            return {
                "key": key,
                "filename": filename,
                "status": "skipped",
                "reason": f"exists (cannot verify: {e})",
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
        with _open_url(request, timeout=DOWNLOAD_TIMEOUT) as resp:
            # Re-validate final URL after redirects
            try:
                final = urlparse(resp.geturl())
                ok, err = _validate_url(final.geturl())
                if not ok:
                    raise ValueError(f"redirected to disallowed url: {err}")
            except Exception as e:
                raise ValueError(f"invalid redirect: {e}")

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

    # Move file to final destination with fallback strategies
    final_tmp = tmp_dir / filename

    # Step 1: Rename within temp dir (should always work)
    try:
        os.replace(tmp_path, final_tmp)
    except (PermissionError, OSError) as e:
        logger.warning("Failed to rename in temp dir: %s, trying copy", e)
        try:
            shutil.copy2(tmp_path, final_tmp)
            tmp_path.unlink()
        except Exception as e2:
            logger.error("Failed to copy in temp dir: %s", e2)
            raise ValueError(f"Failed to rename downloaded file: {e}")

    # Step 2: Move to target directory with aggressive strategies including Windows APIs
    move_success = False
    last_error = None
    max_retries = 3
    retry_delay = 0.5  # seconds

    for attempt in range(max_retries):
        if attempt > 0:
            logger.info(f"Retry attempt {attempt + 1}/{max_retries} for {filename}")
            time.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff

        # Use aggressive move with all available methods
        success, error_msg = _aggressive_move_file(final_tmp, target_path)

        if success:
            move_success = True
            logger.info("Downloaded %s to %s (aggressive move succeeded)", filename, target_path)
            break
        else:
            last_error = error_msg
            if attempt == max_retries - 1:
                logger.error("All move strategies failed for %s after %d attempts: %s",
                           filename, max_retries, error_msg)

    if not move_success:
        # Don't cleanup temp file - let user manually move it
        temp_file_kept = False
        if final_tmp.exists():
            temp_file_kept = True
            logger.error(
                f"File successfully downloaded but could not be moved to {target_path}. "
                f"Downloaded file is kept at: {final_tmp}. "
                f"You can manually move this file to your models directory."
            )

        # Provide detailed error message for Windows permission issues
        error_msg = str(last_error)
        suggestions = []

        if "WinError 5" in error_msg or "Access" in error_msg or "Permission" in error_msg:
            suggestions = [
                f"1. Check if {target_dir} has write permissions",
                f"2. Check if antivirus is blocking the file",
                f"3. Close any programs that might be using files in {target_dir}",
                f"4. Try running ComfyUI as administrator",
                f"5. Check if the drive has enough free space",
                f"6. Try changing the models folder to a different location",
            ]

            if temp_file_kept:
                suggestions.append(
                    f"7. Manually move the file from {final_tmp} to {target_path}"
                )

            error_detail = (
                f"Permission denied writing to {target_dir}.\n\n"
                f"Troubleshooting steps:\n" + "\n".join(suggestions) + "\n\n"
                f"Original error: {last_error}"
            )
        else:
            error_detail = f"Failed to move file to destination: {last_error}"
            if temp_file_kept:
                error_detail += f"\n\nFile kept at: {final_tmp}"

        raise ValueError(error_detail)

    return {"key": key, "filename": filename, "status": "ok"}


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
    url = _canonicalize_download_url(str(raw.get("url") or "").strip())
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
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
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
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
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
    audit_logger.log_event(
        request,
        action="models.recipes.save",
        resource="recipes",
        details={"count": len(items)},
        success=True,
    )
    return web.json_response({"ok": True})


@PromptServer.instance.routes.post("/mjr_models/download")
async def mjr_models_download(request: web.Request) -> web.Response:
    """Start a background download job for model files."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
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

    audit_logger.log_event(
        request,
        action="models.download.start",
        resource=job_id,
        details={"count": len(items)},
        success=True,
    )
    return web.json_response({"ok": True, "job_id": job_id})


@PromptServer.instance.routes.get("/mjr_models/download_status")
async def mjr_models_download_status(request: web.Request) -> web.Response:
    """Get the status of a download job."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_read")
    if rate_error:
        return rate_error
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
            "summary": job.get("summary") or {"downloaded": 0, "errors": 0, "skipped": 0},
        }
    )


@PromptServer.instance.routes.post("/mjr_models/search_online")
async def mjr_models_search_online(request: web.Request) -> web.Response:
    """Search for models on CivitAI, Hugging Face, and GitHub."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_search")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
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

    audit_logger.log_event(
        request,
        action="models.search_online",
        resource="search",
        details={"query_len": len(query), "limit": int(limit)},
        success=True,
    )
    return web.json_response({"ok": True, "results": results})
