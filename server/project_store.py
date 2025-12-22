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

# Per-project workflow save locks
_workflow_locks: Dict[str, threading.Lock] = {}
_workflow_locks_lock = threading.Lock()

DEFAULT_PROJECT_DIRS = [
    "00_META",
    "01_IN/REFS",
    "01_IN/SOURCES",
    "02_OUT/IMAGES",
    "02_OUT/VIDEOS",
    "02_OUT/OTHER",
    "03_WORKFLOWS",
    "04_NOTES",
]

DEFAULT_PROJECT_ROLES = {
    "images": "02_OUT/IMAGES",
    "videos": "02_OUT/VIDEOS",
    "other": "02_OUT/OTHER",
    "workflows": "03_WORKFLOWS",
    "meta": "00_META",
}

_structure_lock = threading.Lock()
_structure_cache: Dict[str, Any] | None = None
_structure_mtime: float | None = None

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


def _structure_path() -> Path:
    return Path(__file__).resolve().parent.parent / "project_structure.json"


def _normalize_rel(value: str) -> str:
    rel = str(value or "").replace("\\", "/").strip()
    rel = _MULTIPLE_SLASHES_RE.sub("/", rel)
    rel = rel.strip("/").strip("\\")
    return rel


def _is_safe_rel(value: str) -> bool:
    if not value:
        return False
    v = str(value)
    if v.startswith("/") or v.startswith("\\"):
        return False
    if ":" in v:
        return False
    if ".." in v:
        return False
    return True


def _coerce_dirs(raw) -> list[str]:
    if not isinstance(raw, list):
        return []
    out = []
    seen = set()
    for item in raw:
        if not isinstance(item, str):
            continue
        rel = _normalize_rel(item)
        if not _is_safe_rel(rel):
            continue
        if rel and rel not in seen:
            seen.add(rel)
            out.append(rel)
    return out


def _coerce_roles(raw) -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if not isinstance(key, str) or not isinstance(value, str):
                continue
            rel = _normalize_rel(value)
            if not _is_safe_rel(rel):
                continue
            out[key] = rel
    for key, fallback in DEFAULT_PROJECT_ROLES.items():
        if key not in out:
            out[key] = _normalize_rel(fallback)
    return out


def get_project_structure() -> Dict[str, Any]:
    global _structure_cache, _structure_mtime
    path = _structure_path()
    mtime = None
    if path.exists():
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = None
    with _structure_lock:
        if _structure_cache is not None and _structure_mtime == mtime:
            return _structure_cache

        data: Dict[str, Any] = {}
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error(f"Failed to read project_structure.json: {e}")
                data = {}

        dirs = _coerce_dirs(data.get("dirs") if isinstance(data, dict) else None)
        if not dirs:
            dirs = list(DEFAULT_PROJECT_DIRS)
        roles = _coerce_roles(data.get("roles") if isinstance(data, dict) else None)

        _structure_cache = {"dirs": dirs, "roles": roles}
        _structure_mtime = mtime
        return _structure_cache


def get_role_dir(role: str, fallback: str) -> str:
    structure = get_project_structure()
    roles = structure.get("roles") or {}
    value = roles.get(role) or fallback
    rel = _normalize_rel(value)
    if not _is_safe_rel(rel):
        rel = _normalize_rel(fallback)
    return rel


def get_meta_dir() -> str:
    return get_role_dir("meta", "00_META")


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
        return get_role_dir("images", "02_OUT/IMAGES")
    if m == "videos":
        return get_role_dir("videos", "02_OUT/VIDEOS")
    return get_role_dir("other", "02_OUT/OTHER")


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
    - check all path components for symlinks that escape.
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

    # Check each path component for symlinks that escape
    current_path = root
    for part in parts:
        current_path = current_path / part
        if current_path.is_symlink():
            symlink_target = current_path.readlink()
            if symlink_target.is_absolute():
                raise ValueError(f"Symlink component points to absolute path: {current_path}")
            # Check if symlink target would escape root
            try:
                resolved_target = (current_path.parent / symlink_target).resolve(strict=False)
                if not _is_relative_to(resolved_target, root):
                    raise ValueError(f"Symlink component escapes output directory: {current_path}")
            except (OSError, RuntimeError) as e:
                logger.error(f"Failed to check symlink target '{symlink_target}': {e}")
                raise ValueError(f"Invalid symlink: {current_path}")

    candidate_unresolved = root / Path(*parts)

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


def read_json(path: Path, default: Any, strict: bool = False) -> Any:
    """Read JSON file with size validation and proper error handling."""
    try:
        if not path.exists():
            return default

        # Check file size before reading
        file_size = path.stat().st_size
        if file_size > MAX_JSON_SIZE:
            msg = f"JSON file too large ({file_size} bytes): {path}"
            if strict:
                raise ValueError(msg)
            logger.error(msg)
            return default

        content = path.read_text(encoding="utf-8")
        return json.loads(content)

    except json.JSONDecodeError as e:
        msg = f"Invalid JSON in {path}: {e}"
        if strict:
            raise ValueError(msg)
        logger.error(msg)
        return default
    except PermissionError as e:
        msg = f"Permission denied reading {path}: {e}"
        if strict:
            raise ValueError(msg)
        logger.error(msg)
        return default
    except OSError as e:
        msg = f"OS error reading {path}: {e}"
        if strict:
            raise ValueError(msg)
        logger.error(msg)
        return default
    except Exception as e:
        msg = f"Unexpected error reading {path}: {e}"
        if strict:
            raise ValueError(msg)
        logger.error(msg)
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
        return read_json(get_index_path(), {}, strict=True)


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
    structure = get_project_structure()
    dirs = list(structure.get("dirs") or [])
    roles = list((structure.get("roles") or {}).values())
    meta_dir = get_meta_dir()
    seen = set()
    rel_dirs = []
    for rel in dirs + roles + [meta_dir]:
        norm = _normalize_rel(rel)
        if norm and norm not in seen and _is_safe_rel(norm):
            seen.add(norm)
            rel_dirs.append(norm)

    ensure_dirs([f"{base}/{rel}" for rel in rel_dirs])

    current_path = current_json_path(project_folder)
    if not current_path.exists():
        write_json_atomic(
            current_path,
            {"project_id": project_id, "project_folder": project_folder},
        )


def current_json_path(project_folder: str) -> Path:
    meta_dir = get_meta_dir()
    return safe_under_output(f"PROJECTS/{project_folder}/{meta_dir}/current.json")


def save_current(project_id: str, data: Dict[str, Any]) -> None:
    project_folder = (data or {}).get("project_folder")
    if not project_folder:
        index = load_index()
        entry = index.get(project_id) or {}
        project_folder = entry.get("folder")
    if not project_folder:
        raise ValueError("project_folder not found for project_id")
    path = current_json_path(project_folder)
    payload = dict(data or {})
    payload["updated_at"] = datetime.now().isoformat()
    write_json_atomic(path, payload)


def load_current(project_id: str) -> Dict[str, Any]:
    try:
        index = load_index()
    except ValueError as e:
        logger.error(f"Failed to load index for current project: {e}")
        return {}
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


def get_workflow_lock(project_id: str) -> threading.Lock:
    """Get or create a per-project workflow save lock."""
    with _workflow_locks_lock:
        if project_id not in _workflow_locks:
            _workflow_locks[project_id] = threading.Lock()
        return _workflow_locks[project_id]
