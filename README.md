# ComfyUI-Majoor-ProjectSettings 🚀
**Project-aware outputs + workflow organization for ComfyUI** — without adding any ComfyUI nodes.

This extension turns ComfyUI into a lightweight “mini pipeline”: you pick a project, it creates/maintains a clean folder structure under `output/`, auto-patches save/export nodes (paths + filename prefixes), and lets you save workflows inside the project (optionally mirrored to `ComfyUI/workflows/`).

> Zero new nodes. Maximum order. Your future self will stop cursing your past self. (Maybe.)
---
 
## Status & empty workflows
- The Project Settings status bar watches your canvas and turns red when the current graph is empty while prompting you (via dialog) to create or assign a project instead of flooding toasts.
- Toggle the `MajoorPS: Black status when no project` setting (in the MajoorPS settings category) if you'd rather keep a neutral indicator while you experiment without an active project.

---

## Key Features
- **Project management** inside ComfyUI (create / select / list).
- **Standardized folder structure** per project under `output/PROJECTS/<project>/...`.
- **Auto-patch “save/export” nodes**:
  - sets a **safe relative output folder** (always under `output/`)
  - sets a **filename prefix** (project/asset/model/date driven)
  - supports many custom nodes via configurable “path widget” names.
- **Template-based output paths** using tokens (`{BASE}`, `{MEDIA}`, `{DATE}`, `{NAME}`, `{MODEL}`, etc.).
- **Project-aware workflow save**:
  - saves workflows into the project folder
  - optional **mirror** into `ComfyUI/workflows/` for compatibility.
- **Project signature in workflow** (`graph.extra.mjr_project`) to keep provenance.
- **Empty-graph guard**: the status bar turns red when the current graph has no nodes and the extension will prompt you to create or switch to a project, and there is an optional `MajoorPS: Black status when no project` setting so you can work in a test mode without the warning color.
- **Safe path guardrails**: blocks absolute paths, drive paths, `..`, and other escape attempts.
- **Workflow Utilities: Fix Missing Models** inside the Project Settings panel (no top menu).
- **Workflow Utilities: Download Missing Models** inside the Project Settings panel (recipes + direct URLs).
- **Advanced fingerprint cache** (optional) for future hash-based model resolution.

---

## Installation

### Option A — Git (recommended)
1. Go to your ComfyUI folder:
   - `ComfyUI/custom_nodes/`
2. Clone:
   ```bash
   git clone https://github.com/MajoorWaldi/ComfyUI-Majoor-ProjectSettings.git
   ```
3. Restart ComfyUI.

### Option B — ZIP
1. Unzip into:
   - `ComfyUI/custom_nodes/ComfyUI-Majoor-ProjectSettings/`
2. Restart ComfyUI.

✅ The extension exposes a **WEB_DIRECTORY** (`./js`) and registers API routes on startup.

---

## UI Location
Depending on your ComfyUI version:
- If sidebar tabs are supported, you’ll see a **Project Settings** tab.
- Otherwise, the UI falls back to a **floating panel**.

---

## Project Structure (Default)
Everything lives under:

```
output/
└─ PROJECTS/
   ├─ _INDEX/
   │  └─ projects.json
   └─ <PROJECT_FOLDER>/
      ├─ 00_META/
      │  └─ current.json
      ├─ 01_IN/
      │  ├─ REFS/
      │  └─ SOURCES/
      ├─ 02_OUT/
      │  ├─ IMAGES/
      │  ├─ VIDEOS/
      │  └─ OTHER/
      ├─ 03_WORKFLOWS/
      └─ 04_NOTES/
```

- `projects.json` stores your project index (last used, archived, etc.)
- `current.json` stores the active project on disk (useful for external scripts/tools)

---

## Configuration: `project_structure.json`
You can customize the project directories and role mappings:

```json
{
  "dirs": [
    "00_META",
    "01_IN/REFS",
    "01_IN/SOURCES",
    "02_OUT/IMAGES",
    "02_OUT/VIDEOS",
    "02_OUT/OTHER",
    "03_WORKFLOWS",
    "04_NOTES"
  ],
  "roles": {
    "images": "02_OUT/IMAGES",
    "videos": "02_OUT/VIDEOS",
    "other": "02_OUT/OTHER",
    "workflows": "03_WORKFLOWS"
  }
}
```

- `dirs`: physically created directories
- `roles`: logical aliases used by the extension

---

## Output Templates (Path Resolver)
The extension generates **relative output paths** (always safe under `output/`) using templates.

### Common Tokens
Typical server/UI token set:
- `{BASE}`: `PROJECTS/<project_folder>`
- `{MEDIA}`: media subdir (e.g. `02_OUT/IMAGES`)
- `{DATE}`: `YYMMDD` (e.g. `251222`)
- `{NAME}`: normalized asset/shot name
- `{KIND}`: kind label (asset/shot/etc., normalized)
- `{MODEL}`: normalized model label (optionally uppercased from UI)

### Example Template
```txt
{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}
```

Example resolved output:
```txt
PROJECTS/MY_PROJECT/02_OUT/IMAGES/251222/AdrianCloseUp/FLUX_DEV
```

---

## Node Patching (Save/Export Nodes)
The extension scans the current graph and patches “save-like” nodes:
- detection: node type contains patterns like `save`, `export`, `combine` (implementation-specific)
- patch targets:
  - `filename_prefix`
  - plus one recognized **path widget** (configurable list)

### Supported Path Widget Names
Runtime-config endpoint:
- `GET /mjr_project/config` → `path_widgets`

If your custom node uses a different widget name for its output folder/path:
- add it to the server defaults (e.g. `PATH_WIDGETS_DEFAULT` in `server/project_routes.py`)
- restart ComfyUI

---

## Workflow Saving (Project-aware)
Endpoint:
- `POST /mjr_project/workflow/save`

Behavior:
- saves the workflow to:
  - `PROJECTS/<project_folder>/<workflows_role>/<optional_subdir>/<workflow_name>.json`
- optionally mirrors to:
  - `ComfyUI/workflows/`

Returned fields usually include:
- `project_rel_path`
- `workflow_rel_dir`
- `comfy_workflow_rel`
- `mirrored`, `mirror_error`

---

## Workflow Utilities: Fix Missing Models (Panel)
The Project Settings panel includes a "Fix Missing Models" button that scans the current
graph for combo widgets whose selected model is no longer present in the available values.
It proposes exact and near matches (fuzzy) and applies the selection back to the graph.

Behavior summary:
- Missing detection is local (in-memory widgets, no API required).
- Candidates are suggested via a server scan with exact + fuzzy matching.
- Applied fixes update widget values and refresh the graph.

---

## Workflow Utilities: Download Missing Models (Panel)
The Project Settings panel includes a "Download Missing Models" button that resolves
missing model names to download recipes. You can paste direct URLs for missing items and
optionally remember them for next time in:
`output/PROJECTS/_INDEX/model_sources.json`

Rules:
- Only direct http/https URLs are accepted.
- Allowed extensions: `.safetensors`, `.ckpt`, `.pt`, `.pth`, `.bin`
- Optional SHA256 verification if provided.
- Hugging Face token can be provided via `HUGGINGFACE_HUB_TOKEN` or `HF_TOKEN`.
- Limits can be tuned via `MJR_MODEL_DOWNLOAD_MAX_BYTES` and `MJR_MODEL_DOWNLOAD_TIMEOUT`.

Endpoints:
- `POST /mjr_models/resolve_recipes`
- `POST /mjr_models/save_recipes`
- `POST /mjr_models/download`
- `GET /mjr_models/download_status`

---

## Advanced: Fingerprint Cache
An optional cache can be built under:
`output/PROJECTS/_INDEX/model_fingerprints.json`

The cache stores lightweight fingerprints (sha256 of first 1MB + last 1MB + size bytes).
This enables future hash-based resolution when model filenames or paths change.

Endpoints:
- `GET /mjr_models/fingerprint_cache_status`
- `POST /mjr_models/build_fingerprint_cache`
- `POST /mjr_models/resolve_by_fingerprint`

---

## API Reference (High-Level)
Base URL: your ComfyUI host/port.

### Set / Select a project
`POST /mjr_project/set`
```json
{ "project_name": "My Cool Project" }
```

### List projects
`GET /mjr_project/list?include_archived=0|1`

### List available models (from ComfyUI)
`GET /mjr_project/models`

### Get runtime config (includes path widgets)
`GET /mjr_project/config`

### Resolve project by folder name
`GET /mjr_project/resolve?folder=<project_folder>`

### Preview template resolution
`POST /mjr_project/preview_template`
```json
{
  "template": "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}",
  "tokens": {
    "BASE": "PROJECTS/MY_PROJECT",
    "MEDIA": "02_OUT/IMAGES",
    "DATE": "251222",
    "NAME": "AdrianCloseUp",
    "MODEL": "FLUX_DEV"
  }
}
```

### Create/validate a custom output dir + prefix (conceptual)
`POST /mjr_project/create_custom_out`
```json
{
  "project_id": "...",
  "kind": "asset",
  "name": "AdrianCloseUp",
  "media": "images",
  "model": "Flux Dev",
  "model_upper": true,
  "date": "251222",
  "template": "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}"
}
```

### Archive / Unarchive / Delete
- `POST /mjr_project/archive`
- `POST /mjr_project/unarchive`
- `POST /mjr_project/delete`

> “delete” is designed to be safe-by-default: it typically removes index entries and avoids dangerous disk nukes unless explicitly implemented.

---

## Local UI State
The UI persists state in `localStorage`:
- key: `mjr_project_settings_state`

So your settings survive browser refreshes and ComfyUI restarts (unless the browser decides it’s in a mood).

---

## Repo Layout (Typical)
- `__init__.py`
  - exposes `WEB_DIRECTORY`
  - imports server routes
- `server/`
  - `project_routes.py` (AIOHTTP endpoints via `PromptServer.instance.routes`)
  - `project_store.py` (folder structure + safe path utils + index/current handling)
- `js/`
  - `majoor_project_settings.js` (ComfyUI extension entry, UI, hooks)
  - `state_manager.js` (persistence/state)
  - `ui_components.js` (UI helpers)
  - `mjr/` (api, graph scan, patching, dialogs, toasts, utilities)

---

## Troubleshooting

### “I don’t see the UI”
- Confirm folder is inside:
  - `ComfyUI/custom_nodes/ComfyUI-Majoor-ProjectSettings/`
- Restart ComfyUI (not just browser refresh).
- Check browser console (F12): logs are usually prefixed with something like `[mjr]`.

### “My save nodes are not being patched”
- The node may not expose:
  - `filename_prefix`, and/or
  - a recognized path widget name (`output_path`, `folder`, `save_path`, etc.)
- Add your widget name to the server’s `PATH_WIDGETS_DEFAULT` and restart.

### “Path rejected / invalid”
- The server intentionally blocks:
  - absolute paths
  - drive paths (`C:\...`)
  - `..` traversal
  - unsafe characters / escape attempts
- This is by design: the extension is strict so it doesn’t become a foot-gun.

### “Ctrl+S conflicts”
- If you hook workflow saving, other extensions might also capture Ctrl+S.
- Prefer capture-phase + stopping propagation (or disable your hotkey if exposed).

---

## Roadmap Ideas
- Project dashboard (notes, tags, quick links)
- More robust asset/shot detection from workflow metadata
- Preset templates per media type (images/videos/comps)
- Tight integration with an Asset/File Manager for a real pipeline feel

---

## API Error Responses

All API endpoints return errors in the following standardized format:

```json
{
  "ok": false,
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

- `400 Bad Request`: Invalid input, validation error, or malformed request
- `404 Not Found`: Project ID, workflow, or resource not found
- `409 Conflict`: Resource already exists (when overwrite=false)
- `415 Unsupported Media Type`: Missing or invalid Content-Type header (must be application/json)
- `500 Internal Server Error`: Server-side error (file I/O, database issues)

### Example Error Responses

```json
// Missing required field
{
  "ok": false,
  "error": "project_name is required"
}

// Invalid characters in input
{
  "ok": false,
  "error": "project_name contains invalid characters (/ \\ : .. not allowed)"
}

// Resource not found
{
  "ok": false,
  "error": "project_id not found"
}

// Validation failure
{
  "ok": false,
  "error": "invalid date format: '999999' (expected YYMMDD, e.g., 251220 for today)"
}
```

---

## License

This project is open source. See LICENSE file for details.

---

## Credits
Built for the ComfyUI ecosystem with one goal: **less chaos, more structure**, and outputs that look like you meant it. 😄
