# ComfyUI-Majoor-ProjectSettings 🚀
**Project-aware outputs + workflow organization for ComfyUI** — without adding any ComfyUI nodes.

This extension turns ComfyUI into a lightweight “mini pipeline”: you pick a project, it creates/maintains a clean folder structure under `output/`, auto-patches save/export nodes (paths + filename prefixes), and lets you save workflows inside the project (optionally mirrored to `ComfyUI/workflows/`).

> Zero new nodes. Maximum order. Your future self will stop cursing your past self. (Maybe.)

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
- **Safe path guardrails**: blocks absolute paths, drive paths, `..`, and other escape attempts.

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

## License
No `LICENSE` file detected in the package → **license is currently undefined**.  
Add one (MIT / Apache-2.0 / GPL / etc.) to make distribution clear and safe.

---

## Credits
Built for the ComfyUI ecosystem with one goal: **less chaos, more structure**, and outputs that look like you meant it. 😄
