"""
Project storage helpers (safe under ComfyUI output directory only).
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import unicodedata
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable

import folder_paths

logger = logging.getLogger(__name__)

# Thread lock for index operations (prevents concurrent modification)
_index_lock = threading.RLock()


_ID_RE = re.compile(r"[^a-z0-9_]+")
_MULTIPLE_SLASHES_RE = re.compile(r"/{2,}")
_WHITESPACE_RE = re.compile(r"\s+")
_UNDERSCORES_RE = re.compile(r"_+")
_SPLIT_TOKENS_RE = re.compile(r"[\s_-]+")
_WORKFLOW_NAME_MAX = 120

# Maximum file size for JSON reads (10MB)
MAX_JSON_SIZE = 10 * 1024 * 1024


def _ascii(text: str) -> str:
    return (
        unicodedata.normalize("NFKD", text)
        .encode("ascii", "ignore")
        .decode("ascii")
    )


def slug_id(text: str) -> str:
    """
    ASCII, lower, tokens [a-z0-9_], spaces -> "_".
    """
    if text is None:
        return ""
    t = _ascii(str(text)).strip().lower()
    t = t.replace("\\", "_").replace("/", "_")
    t = _WHITESPACE_RE.sub("_", t)
    t = _ID_RE.sub("", t)
    t = _UNDERSCORES_RE.sub("_", t).strip("_")
    return t or "project"


def title_token(token: str) -> str:
    if not token:
        return ""
    if len(token) == 1:
        return token.upper()
    return token[0].upper() + token[1:].lower()


def title_path(text: str) -> str:
    """
    Split on spaces/underscores/dashes -> TitleCase each token -> join with "_".
    """
    if text is None:
        return ""
    t = _ascii(str(text)).strip()
    tokens = _SPLIT_TOKENS_RE.split(t)
    out = [title_token(tok) for tok in tokens if tok]
    return "_".join(out) or "Project"


def model_tag(
    text: str,
    upper: bool = False,
    fallback: str = "Unknown",
    max_tokens: int = 3,
) -> str:
    """
    Normalize model name to a short tag (max tokens).
    """
    if text is None:
        return fallback
    t = _ascii(str(text)).strip()
    if not t:
        return fallback
    t = t.replace("\\", "/").split("/")[-1]
    if "." in t:
        t = t.rsplit(".", 1)[0]
    tokens = [tok for tok in _SPLIT_TOKENS_RE.split(t) if tok]
    if not tokens:
        return fallback
    use = tokens[: max(1, int(max_tokens))]
    if upper:
        return "_".join(use).upper() or fallback
    return "_".join(title_token(tok) for tok in use) or fallback


def make_media_dir(media: str) -> str:
    m = (media or "").strip().lower()
    if m == "images":
        return "02_OUT/IMAGES"
    if m == "videos":
        return "02_OUT/VIDEOS"
    return "02_OUT/OTHER"


def make_kind_token(kind: str) -> str:
    k = (kind or "").strip().lower()
    if k == "asset":
        return "ASSET"
    if k == "shot":
        return "SHOT"
    return "MISC"


def resolve_template(template: str, tokens: Dict[str, str]) -> str:
    """
    Resolve a relative template path with tokens.
    Tokens: {BASE},{MEDIA},{DATE},{MODEL},{NAME},{KIND}
    """
    if template is None:
        raise ValueError("template is required")

    tpl = str(template).replace("\\", "/").strip()
    if not tpl:
        raise ValueError("template is required")
    if tpl.startswith("/") or tpl.startswith("\\"):
        raise ValueError("template must be relative")
    if ":" in tpl:
        raise ValueError("template must be relative")
    if ".." in tpl:
        raise ValueError("template contains '..'")
    if "{BASE}" not in tpl:
        raise ValueError("template must include {BASE}")

    resolved = tpl
    for key, value in (tokens or {}).items():
        resolved = resolved.replace("{" + key + "}", value)

    resolved = resolved.replace("\\", "/")
    resolved = _MULTIPLE_SLASHES_RE.sub("/", resolved)
    if resolved.startswith("/") or resolved.startswith("\\"):
        raise ValueError("resolved path must be relative")
    if ":" in resolved:
        raise ValueError("resolved path must be relative")
    if ".." in resolved:
        raise ValueError("resolved path contains '..'")

    parts = [p for p in resolved.split("/") if p]
    if any(p == ".." for p in parts):
        raise ValueError("resolved path contains '..'")
    rel = "/".join(parts)
    base = (tokens or {}).get("BASE", "")
    if base:
        base = base.replace("\\", "/").rstrip("/")
        if not (rel == base or rel.startswith(base + "/")):
            raise ValueError("template must stay under {BASE}")
    return rel


def safe_workflow_filename(name: str) -> str:
    """
    Sanitize workflow filename to a safe TitleCase base (no extension).
    """
    if name is None:
        return ""
    raw = str(name).strip()
    if not raw:
        return ""
    raw = raw.replace("\\", " ").replace("/", " ").replace(":", " ")
    if raw.lower().endswith(".json"):
        raw = raw[:-5]
    tokens = [tok for tok in _SPLIT_TOKENS_RE.split(raw) if tok]
    if not tokens:
        return ""
    normalized = []
    for tok in tokens:
        if tok.isdigit():
            normalized.append(tok)
        elif tok.isupper():
            normalized.append(tok)
        else:
            normalized.append(title_token(tok))
    base = "_".join(normalized)
    base = _UNDERSCORES_RE.sub("_", base).strip("_")
    if not base:
        return ""
    if len(base) > _WORKFLOW_NAME_MAX:
        base = base[:_WORKFLOW_NAME_MAX].rstrip("_")
    return base


def user_workflows_root() -> Path:
    return Path(folder_paths.get_user_directory()) / "default" / "workflows"


def write_json_file_atomic(path: Path, data: Any) -> None:
    """Write JSON data atomically to any path (not limited to output)."""
    write_json_atomic(path, data)


def yymmdd_now() -> str:
    return datetime.now().strftime("%y%m%d")


def output_root() -> Path:
    override = None
    try:
        from comfy.cli_args import args as comfy_args
        override = getattr(comfy_args, "output_directory", None)
    except Exception:
        override = None
    if override:
        try:
            return Path(override).resolve()
        except Exception as e:
            logger.warning("Failed to resolve override output directory: %s", e)
    return Path(folder_paths.get_output_directory()).resolve()


def _is_relative_to(path: Path, base: Path) -> bool:
    try:
        return path.is_relative_to(base)  # type: ignore[attr-defined]
    except AttributeError:
        try:
            path.relative_to(base)
            return True
        except Exception:
            return False


def safe_under_output(rel: str) -> Path:
    """
    Safe join under output/:
    - reject absolute, drive paths, "..", ":" and leading "/" or "\".
    - return resolved path under output_root.
    """
    if rel is None:
        raise ValueError("Path is required")

    rel_str = str(rel).replace("\\", "/").strip()
    if rel_str.startswith("/") or rel_str.startswith("\\"):
        raise ValueError(f"Absolute paths are not allowed: {rel_str[:50]}")
    if ":" in rel_str:
        raise ValueError(f"Drive paths are not allowed: {rel_str[:50]}")

    parts = [p for p in rel_str.split("/") if p]
    if any(p == ".." for p in parts):
        raise ValueError(f"Path traversal detected: '..' in path {rel_str[:50]}")

    # Validate BEFORE resolution to prevent symlink attacks
    root = output_root()
    candidate_unresolved = root / Path(*parts)

    # Check if path is a symlink pointing outside root
    if candidate_unresolved.is_symlink():
        symlink_target = candidate_unresolved.readlink()
        if symlink_target.is_absolute():
            raise ValueError(f"Symlink points to absolute path: {candidate_unresolved}")

    # Now resolve and double-check
    try:
        candidate = candidate_unresolved.resolve(strict=False)
    except (OSError, RuntimeError) as e:
        logger.error(f"Failed to resolve path '{rel_str}': {e}")
        raise ValueError(f"Invalid path: {rel_str[:50]}")

    if not _is_relative_to(candidate, root):
        raise ValueError(f"Path escapes output directory: {rel_str[:50]}")
    return candidate


def ensure_dir(rel_dir: str) -> None:
    safe_under_output(rel_dir).mkdir(parents=True, exist_ok=True)


def ensure_dirs(list_rel: Iterable[str]) -> None:
    for rel in list_rel:
        ensure_dir(rel)


def read_json(path: Path, default: Any) -> Any:
    """Read JSON file with size validation and proper error handling."""
    try:
        if not path.exists():
            return default

        # Check file size before reading
        file_size = path.stat().st_size
        if file_size > MAX_JSON_SIZE:
            logger.error(f"JSON file too large ({file_size} bytes): {path}")
            return default

        content = path.read_text(encoding="utf-8")
        return json.loads(content)

    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {path}: {e}")
        return default
    except PermissionError as e:
        logger.error(f"Permission denied reading {path}: {e}")
        return default
    except OSError as e:
        logger.error(f"OS error reading {path}: {e}")
        return default
    except Exception as e:
        logger.error(f"Unexpected error reading {path}: {e}")
        return default


def write_json_atomic(path: Path, data: Any) -> None:
    """Write JSON atomically using UUID-based temp file to prevent race conditions."""
    path.parent.mkdir(parents=True, exist_ok=True)

    # Use UUID to ensure unique temp file (prevents race conditions)
    tmp_name = f"{path.name}.{uuid.uuid4().hex}.tmp"
    tmp = path.parent / tmp_name

    try:
        # Write to temp file
        content = json.dumps(data, indent=2, ensure_ascii=True)
        tmp.write_text(content, encoding="utf-8")

        # Atomic replace (POSIX guarantees atomicity)
        tmp.replace(path)

    except Exception as e:
        # Clean up temp file on error
        if tmp.exists():
            try:
                tmp.unlink()
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup temp file {tmp}: {cleanup_error}")

        logger.error(f"Failed to write JSON atomically to {path}: {e}")
        raise


def get_projects_root() -> Path:
    return safe_under_output("PROJECTS")


def get_index_path() -> Path:
    return safe_under_output("PROJECTS/_INDEX/projects.json")


def load_index() -> Dict[str, Any]:
    """Load project index with thread safety."""
    with _index_lock:
        return read_json(get_index_path(), {})


def save_index(index: Dict[str, Any]) -> None:
    """Save project index with thread safety."""
    with _index_lock:
        index_path = get_index_path()
        write_json_atomic(index_path, index or {})


def update_index_atomic(project_id: str, updater_fn) -> Dict[str, Any]:
    """
    Atomically update index for a specific project.

    Args:
        project_id: The project ID to update
        updater_fn: Function that takes (index, project_id) and modifies the index

    Returns:
        The updated entry for the project
    """
    with _index_lock:
        index = load_index()
        updater_fn(index, project_id)
        save_index(index)
        return index.get(project_id, {})


def ensure_project_base(project_id: str, project_folder: str) -> None:
    base = f"PROJECTS/{project_folder}"
    ensure_dirs(
        [
            f"{base}/00_META",
            f"{base}/01_IN/REFS",
            f"{base}/01_IN/SOURCES",
            f"{base}/02_OUT/IMAGES",
            f"{base}/02_OUT/VIDEOS",
            f"{base}/02_OUT/OTHER",
            f"{base}/03_WORKFLOWS",
            f"{base}/04_NOTES",
        ]
    )

    current_path = current_json_path(project_folder)
    if not current_path.exists():
        write_json_atomic(
            current_path,
            {"project_id": project_id, "project_folder": project_folder},
        )


def current_json_path(project_folder: str) -> Path:
    return safe_under_output(f"PROJECTS/{project_folder}/00_META/current.json")


def save_current(project_id: str, data: Dict[str, Any]) -> None:
    index = load_index()
    entry = index.get(project_id) or {}
    project_folder = entry.get("folder") or data.get("project_folder")
    if not project_folder:
        raise ValueError("project_folder not found for project_id")
    path = current_json_path(project_folder)
    payload = dict(data or {})
    payload["updated_at"] = datetime.now().isoformat()
    write_json_atomic(path, payload)


def load_current(project_id: str) -> Dict[str, Any]:
    index = load_index()
    entry = index.get(project_id) or {}
    project_folder = entry.get("folder")
    if not project_folder:
        return {}
    return read_json(current_json_path(project_folder), {})


def archive_project(project_id: str) -> None:
    """Mark a project as archived without deleting files."""
    def updater(index, pid):
        if pid in index:
            index[pid]["archived"] = True
            index[pid]["archived_at"] = datetime.now().isoformat()

    update_index_atomic(project_id, updater)


def unarchive_project(project_id: str) -> None:
    """Restore an archived project to active status."""
    def updater(index, pid):
        if pid in index:
            index[pid]["archived"] = False
            if "archived_at" in index[pid]:
                del index[pid]["archived_at"]

    update_index_atomic(project_id, updater)


def delete_project_from_index(project_id: str) -> bool:
    """
    Remove project from index (files remain on disk).
    Returns True if project was deleted, False if not found.
    """
    deleted = False

    def updater(index, pid):
        nonlocal deleted
        if pid in index:
            del index[pid]
            deleted = True

    update_index_atomic(project_id, updater)
    return deleted
