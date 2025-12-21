"""
API routes for Majoor Project Settings.
"""

from __future__ import annotations

from datetime import datetime
import re
from typing import Any, Dict, List

from aiohttp import web

import folder_paths
from server import PromptServer

from .project_store import (
    archive_project,
    delete_project_from_index,
    ensure_dir,
    ensure_project_base,
    load_index,
    make_kind_token,
    make_media_dir,
    model_tag,
    resolve_template,
    safe_workflow_filename,
    safe_under_output,
    save_current,
    save_index,
    slug_id,
    title_path,
    unarchive_project,
    update_index_atomic,
    user_workflows_root,
    write_json_file_atomic,
    yymmdd_now,
)


def _json_error(message: str, status: int = 400) -> web.Response:
    return web.json_response({"ok": False, "error": message}, status=status)


def _has_unsafe(value: str) -> bool:
    if value is None:
        return True
    v = str(value)
    if v.startswith("/") or v.startswith("\\"):
        return True
    if ":" in v:
        return True
    if ".." in v:
        return True
    return False


def _now_iso() -> str:
    return datetime.now().isoformat()


def _validate_date_yymmdd(date: str) -> bool:
    """Validate YYMMDD format and ensure it's a real date."""
    if not date or not date.isdigit() or len(date) != 6:
        return False
    try:
        # Parse as YYMMDD
        datetime.strptime(date, "%y%m%d")
        return True
    except ValueError:
        return False


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _require_json(request: web.Request) -> bool:
    """Validate Content-Type header for JSON endpoints."""
    content_type = request.headers.get("Content-Type", "")
    return "application/json" in content_type.lower()


@PromptServer.instance.routes.post("/mjr_project/set")
async def mjr_project_set(request: web.Request) -> web.Response:
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_name = (body.get("project_name") or "").strip()
    if not project_name:
        return _json_error("project_name is required")
    if len(project_name) > 255:
        return _json_error("project_name is too long (max 255 characters)")
    if _has_unsafe(project_name):
        return _json_error("project_name contains invalid characters (/ \\ : .. not allowed)")
    if "/" in project_name or "\\" in project_name:
        return _json_error("project_name contains invalid characters (/ \\ not allowed)")

    create_base = _to_bool(body.get("create_base", True))
    project_id = slug_id(project_name)
    project_folder = title_path(project_name).upper()

    # Validate that slug_id produced a valid result (not empty/default)
    if not project_id or project_id == "project":
        if project_name.strip():
            return _json_error(f"project_name '{project_name[:50]}' contains only special characters or non-ASCII text that cannot be converted to a valid ID")
        return _json_error("project_name is required")

    if create_base:
        ensure_project_base(project_id, project_folder)

    # Atomically update the index to prevent race conditions
    now = _now_iso()

    def updater(index, pid):
        if pid not in index:
            index[pid] = {
                "folder": project_folder,
                "created_at": now,
                "last_used": now,
            }
        else:
            entry = index[pid]
            entry["folder"] = project_folder
            entry["last_used"] = now

    update_index_atomic(project_id, updater)

    base_rel = f"PROJECTS/{project_folder}"
    save_current(
        project_id,
        {
            "project_id": project_id,
            "project_name_original": project_name,
            "project_folder": project_folder,
            "base_rel": base_rel,
        },
    )

    return web.json_response(
        {
            "ok": True,
            "project_id": project_id,
            "project_folder": project_folder,
            "base_rel": base_rel,
        }
    )


@PromptServer.instance.routes.get("/mjr_project/list")
async def mjr_project_list(request: web.Request) -> web.Response:
    index = load_index()

    # Optional filter: include_archived (default: false)
    include_archived = request.query.get("include_archived", "").lower() in ("1", "true", "yes")

    # Batch check: get PROJECTS root once instead of per-project
    try:
        projects_root = safe_under_output("PROJECTS")
        projects_root_exists = projects_root.exists()
    except Exception:
        projects_root_exists = False

    projects: List[Dict[str, Any]] = []
    for project_id, entry in index.items():
        # Skip archived projects unless requested
        is_archived = entry.get("archived", False)
        if is_archived and not include_archived:
            continue

        folder = entry.get("folder", "")
        exists = False

        if folder and projects_root_exists:
            try:
                # Only check if parent exists (avoids N filesystem calls)
                project_path = projects_root / folder
                exists = project_path.exists()
            except Exception:
                exists = False

        projects.append(
            {
                "project_id": project_id,
                "folder": folder,
                "exists": exists,
                "archived": is_archived,
                "last_used": entry.get("last_used", ""),
                "created_at": entry.get("created_at", ""),
            }
        )

    projects.sort(key=lambda x: x.get("last_used") or "", reverse=True)
    return web.json_response({"ok": True, "projects": projects})


@PromptServer.instance.routes.get("/mjr_project/models")
async def mjr_project_models(request: web.Request) -> web.Response:
    def try_list(cat: str) -> List[str]:
        try:
            return sorted(folder_paths.get_filename_list(cat))
        except Exception:
            return []

    categories = {}
    for cat in ["diffusion_models", "checkpoints"]:
        categories[cat] = try_list(cat)
    for cat in [
        "vae",
        "loras",
        "text_encoders",
        "clip",
        "clip_vision",
        "controlnet",
        "upscale_models",
        "embeddings",
        "unet",
    ]:
        categories[cat] = try_list(cat)
    return web.json_response({"ok": True, "categories": categories})


@PromptServer.instance.routes.get("/mjr_project/resolve")
async def mjr_project_resolve(request: web.Request) -> web.Response:
    folder = (request.query.get("folder") or "").strip()
    if not folder or _has_unsafe(folder):
        return _json_error("invalid folder")

    index = load_index()
    for project_id, entry in index.items():
        if entry.get("folder") == folder:
            return web.json_response(
                {"ok": True, "project_id": project_id, "folder": folder}
            )

    return web.json_response({"ok": False, "error": "not_found"}, status=404)


@PromptServer.instance.routes.post("/mjr_project/create_custom_out")
async def mjr_project_create_custom_out(request: web.Request) -> web.Response:
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_id = (body.get("project_id") or "").strip()
    kind = (body.get("kind") or "").strip().lower()
    name = (body.get("name") or "").strip()
    media = (body.get("media") or "").strip().lower()
    model = (body.get("model") or "Unknown").strip()
    model_upper = _to_bool(body.get("model_upper", False))
    date = (body.get("date") or "").strip()
    template = (body.get("template") or "").strip()

    if not project_id or _has_unsafe(project_id):
        return _json_error("invalid project_id")
    if kind not in ("asset", "shot"):
        return _json_error("invalid kind")
    if not name:
        return _json_error("name is required")
    if "/" in name or "\\" in name:
        return _json_error("name contains invalid characters (/ \\ not allowed)")
    if media not in ("images", "videos"):
        return _json_error("invalid media")
    if _has_unsafe(name) or _has_unsafe(model) or (_has_unsafe(date) if date else False):
        return _json_error("invalid input")

    index = load_index()
    entry = index.get(project_id)
    if not entry:
        return _json_error("project_id not found", status=404)

    project_folder = entry.get("folder")
    if not project_folder:
        return _json_error("project folder not found", status=404)

    name_folder = title_path(name)
    model_folder = model_tag(model or "Unknown", upper=model_upper, max_tokens=3)

    # Validate date format (YYMMDD) and ensure it's a real date
    if date and not _validate_date_yymmdd(date):
        return _json_error(f"invalid date format: '{date}' (expected YYMMDD, e.g., 251220 for Dec 20, 2025)")
    if not date:
        date = yymmdd_now()

    base_rel = f"PROJECTS/{project_folder}"
    try:
        media_token = make_media_dir(media)
    except Exception:
        return _json_error("invalid media")
    kind_token = make_kind_token(kind)
    tokens = {
        "BASE": base_rel,
        "MEDIA": media_token,
        "DATE": date,
        "MODEL": model_folder,
        "NAME": name_folder,
        "KIND": kind_token,
    }

    if template:
        try:
            rel_dir = resolve_template(template, tokens)
        except Exception as e:
            return _json_error(str(e), status=400)
    else:
        rel_dir = f"{base_rel}/{media_token}/{date}/{name_folder}/{model_folder}"

    try:
        safe_under_output(rel_dir)
    except Exception as e:
        return _json_error(str(e), status=400)

    ensure_dir(rel_dir)

    return web.json_response(
        {
            "ok": True,
            "rel_dir": rel_dir,
            "filename_prefix": f"{date}_{name_folder}_",
            "project_folder": project_folder,
            "media": media,
            "kind": kind,
            "model_folder": model_folder,
            "model_upper": model_upper,
        }
    )


@PromptServer.instance.routes.post("/mjr_project/workflow/save")
async def mjr_project_workflow_save(request: web.Request) -> web.Response:
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_id = (body.get("project_id") or "").strip()
    workflow_name = (body.get("workflow_name") or "").strip()
    asset_folder = (body.get("asset_folder") or "").strip()
    workflow = body.get("workflow")
    overwrite = _to_bool(body.get("overwrite", False))
    mirror = _to_bool(body.get("mirror_to_comfy_workflows", True))
    use_subfolder = _to_bool(body.get("use_project_subfolder_in_workflows", True))

    if not project_id or _has_unsafe(project_id):
        return _json_error("invalid project_id")
    if workflow is None or not isinstance(workflow, dict):
        return _json_error("workflow must be an object")
    if workflow_name and _has_unsafe(workflow_name):
        return _json_error("invalid workflow_name")
    if asset_folder:
        if _has_unsafe(asset_folder) or "/" in asset_folder or "\\" in asset_folder:
            return _json_error("invalid asset_folder")

    index = load_index()
    entry = index.get(project_id)
    if not entry:
        return _json_error("project_id not found", status=404)

    project_folder = entry.get("folder")
    if not project_folder or _has_unsafe(project_folder):
        return _json_error("project folder not found", status=404)

    file_base = safe_workflow_filename(workflow_name)
    if not file_base:
        file_base = f"{yymmdd_now()}_Model_Asset"
    if len(file_base) > 115:
        file_base = file_base[:115].rstrip("_")

    asset_folder_norm = ""
    if asset_folder:
        asset_folder_norm = title_path(asset_folder)
        if not asset_folder_norm or _has_unsafe(asset_folder_norm):
            return _json_error("invalid asset_folder")

    workflows_rel_dir = f"PROJECTS/{project_folder}/03_WORKFLOWS"
    if asset_folder_norm:
        workflows_rel_dir = f"{workflows_rel_dir}/{asset_folder_norm}"
    try:
        ensure_dir(workflows_rel_dir)
        workflows_dir = safe_under_output(workflows_rel_dir)
    except Exception as e:
        return _json_error(str(e), status=400)

    pattern = re.compile(rf"^{re.escape(file_base)}_(\\d{{4}})\\.json$", re.IGNORECASE)
    max_index = 0
    if workflows_dir.exists():
        try:
            for entry in workflows_dir.iterdir():
                if not entry.is_file():
                    continue
                match = pattern.match(entry.name)
                if match:
                    try:
                        idx = int(match.group(1))
                        if idx > max_index:
                            max_index = idx
                    except ValueError:
                        continue
        except Exception:
            pass
    next_index = max_index + 1
    suffix = f"{next_index:04d}"
    file_name = f"{file_base}_{suffix}.json"

    project_rel_path = f"{workflows_rel_dir}/{file_name}"
    try:
        project_path = safe_under_output(project_rel_path)
    except Exception as e:
        return _json_error(str(e), status=400)

    if project_path.exists() and not overwrite:
        return _json_error("workflow file already exists", status=409)

    try:
        write_json_file_atomic(project_path, workflow)
    except Exception as e:
        return _json_error(f"failed to save workflow: {e}", status=500)

    mirrored = False
    comfy_rel = ""
    mirror_error = ""
    if mirror:
        try:
            target_root = user_workflows_root()
            target_root.mkdir(parents=True, exist_ok=True)
            if use_subfolder:
                if asset_folder_norm:
                    target_path = target_root / project_folder / asset_folder_norm / file_name
                    comfy_rel = f"workflows/{project_folder}/{asset_folder_norm}/{file_name}"
                else:
                    target_path = target_root / project_folder / file_name
                    comfy_rel = f"workflows/{project_folder}/{file_name}"
            else:
                if asset_folder_norm:
                    target_path = target_root / f"{project_folder}__{asset_folder_norm}__{file_name}"
                    comfy_rel = f"workflows/{project_folder}__{asset_folder_norm}__{file_name}"
                else:
                    target_path = target_root / f"{project_folder}__{file_name}"
                    comfy_rel = f"workflows/{project_folder}__{file_name}"

            root_resolved = target_root.resolve()
            target_resolved = target_path.resolve()
            if not target_resolved.is_relative_to(root_resolved):
                raise ValueError("workflow path escapes workflows root")

            if target_path.exists() and not overwrite:
                mirror_error = "workflow already exists in workflows"
            else:
                target_path.parent.mkdir(parents=True, exist_ok=True)
                write_json_file_atomic(target_path, workflow)
                mirrored = True
        except Exception as e:
            mirror_error = str(e)

    return web.json_response(
        {
            "ok": True,
            "project_rel_path": project_rel_path,
            "workflow_rel_dir": workflows_rel_dir,
            "comfy_workflow_rel": comfy_rel,
            "project_folder": project_folder,
            "file": file_name,
            "mirrored": mirrored,
            "mirror_error": mirror_error or "",
            "asset_folder_norm": asset_folder_norm,
        }
    )


@PromptServer.instance.routes.post("/mjr_project/archive")
async def mjr_project_archive(request: web.Request) -> web.Response:
    """Archive a project (hide from active list)."""
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_id = (body.get("project_id") or "").strip()
    if not project_id:
        return _json_error("project_id is required")

    index = load_index()
    if project_id not in index:
        return _json_error("project_id not found", status=404)

    try:
        archive_project(project_id)
        return web.json_response({"ok": True, "project_id": project_id})
    except Exception as e:
        return _json_error(f"Failed to archive project: {str(e)}", status=500)


@PromptServer.instance.routes.post("/mjr_project/unarchive")
async def mjr_project_unarchive(request: web.Request) -> web.Response:
    """Restore an archived project to active status."""
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_id = (body.get("project_id") or "").strip()
    if not project_id:
        return _json_error("project_id is required")

    index = load_index()
    if project_id not in index:
        return _json_error("project_id not found", status=404)

    try:
        unarchive_project(project_id)
        return web.json_response({"ok": True, "project_id": project_id})
    except Exception as e:
        return _json_error(f"Failed to unarchive project: {str(e)}", status=500)


@PromptServer.instance.routes.post("/mjr_project/delete")
async def mjr_project_delete(request: web.Request) -> web.Response:
    """
    Remove project from index (files remain on disk).
    Requires explicit confirmation parameter to prevent accidents.
    """
    if not _require_json(request):
        return _json_error("Content-Type must be application/json", status=415)

    try:
        body: Dict[str, Any] = await request.json()
    except Exception:
        return _json_error("invalid JSON body")

    project_id = (body.get("project_id") or "").strip()
    confirm = _to_bool(body.get("confirm", False))

    if not project_id:
        return _json_error("project_id is required")

    if not confirm:
        return _json_error("confirm parameter must be true to delete project")

    try:
        deleted = delete_project_from_index(project_id)
        if deleted:
            return web.json_response(
                {
                    "ok": True,
                    "project_id": project_id,
                    "message": "Project removed from index (files preserved on disk)",
                }
            )
        else:
            return _json_error("project_id not found", status=404)
    except Exception as e:
        return _json_error(f"Failed to delete project: {str(e)}", status=500)
