# ComfyUI Core Alignment Improvement Audit

Date: 2026-05-27

## Sources Checked

- ComfyUI JavaScript commands/keybindings docs: https://docs.comfy.org/custom-nodes/js/javascript_commands_keybindings
- ComfyUI JavaScript settings docs: https://docs.comfy.org/custom-nodes/js/javascript_settings
- ComfyUI JavaScript extension overview: https://docs.comfy.org/custom-nodes/js/javascript_overview
- ComfyUI server routes docs: https://docs.comfy.org/development/comfyui-server/comms_routes
- ComfyUI server overview: https://docs.comfy.org/development/comfyui-server/comms_overview
- ComfyUI Registry overview: https://docs.comfy.org/registry/overview
- ComfyUI pyproject registry spec: https://docs.comfy.org/registry/specifications

## Current Strong Alignment

- Frontend assets are now under `web/js/` and exported through `WEB_DIRECTORY = "./web/js"`, matching current ComfyUI custom-node guidance.
- The extension registers through `app.registerExtension`.
- Settings are declared in the extension metadata.
- A command and keybinding are registered for project workflow save.
- Sidebar integration uses `registerSidebarTab` with a fallback floating panel.
- Python routes use `PromptServer.instance.routes`.
- `pyproject.toml` now has registry-oriented `[project]`, `[project.urls]`, and `[tool.comfy]` sections.
- TypeScript source is strict and compiles to committed runtime JavaScript.

## Highest Priority Improvements

### 1. Re-enable server protection helpers

Status: fixed in the current working tree; keep tests green before commit.

The audit found that `server/route_utils.py` disabled same-origin checks, API-key/loopback auth, and rate limiting. That conflicted with the README security claims and was risky because this extension can write workflows, mutate project indexes, scan local model folders, and start downloads.

Implemented fix:

- Restore same-origin validation for mutating routes.
- Require loopback access by default when no `MJR_API_KEY` is set.
- Honor `MJR_API_KEY` / `Authorization: Bearer`.
- Restore per-IP/per-bucket rate limiting.
- Validate CSRF cookie/header for browser-origin mutating requests.
- Keep explicit env overrides for trusted local debugging.
- Added tests for allowed loopback, rejected non-loopback, accepted API key, rejected origin, CSRF, and rate limit behavior.

### 2. Stop using raw `Ctrl+S` interception when modern command keybindings exist

Status: fixed in the current working tree; modern ComfyUI command/keybinding is primary.

`src/majoor_project_settings.ts` registers a ComfyUI command/keybinding, but still installs a capture-phase `window.addEventListener("keydown", ...)` that calls `stopImmediatePropagation()`.

ComfyUI docs note that extension keybinding collisions are undefined and core keybindings cannot be overwritten. The raw capture listener can still interfere with core or other extension behavior.

Implemented fix:

- Prefer the registered command/keybinding.
- Keep raw `keydown` only as an opt-in legacy fallback for older ComfyUI builds.
- Added `MajoorPS: Legacy Ctrl+S hook`.
- Defaulted that setting to `false`.

### 3. Unify setting reads through the modern settings API

Status: fixed in the current working tree.

`src/majoor_project_settings.ts` correctly prefers `app.extensionManager.setting.get(...)`, but `src/ui_components.ts` still reads only `app.ui.settings.settingsValues`.

Implemented fix:

- Move setting access into a shared frontend settings adapter.
- Use this order everywhere:
  1. `app.extensionManager.setting.get(id)`
  2. `app.ui.settings.getSettingValue(id)`
  3. `app.ui.settings.settingsValues[id]`
  4. fallback
- Add typed setting IDs and remove duplicate `toBool` helpers.

### 4. Reduce broad auto-open / auto-prompt behavior

Status: fixed in the current working tree.

The extension previously prompted on empty workflow transitions and auto-opened the Project Settings tab when missing models were detected by default. This was useful, but could feel intrusive inside ComfyUI workflows.

Implemented fix:

- Empty-graph modal prompting is now behind `MajoorPS: Prompt on empty workflow`, default `false`.
- Auto-open on missing models defaults to `false`.
- Passive status remains available through badge/toast/panel state.

### 5. Use ComfyUI-friendly names and registry metadata consistently

Status: medium.

The registry spec recommends short node IDs that do not include `ComfyUI`. The current `pyproject.toml` uses `majoor-project-settings`, which is good. The GitHub repo name can stay as-is, but docs should call the registry/package name `majoor-project-settings`.

Recommended fix:

- Add classifiers once license/support matrix is decided.
- Add `requires-comfyui` under `[tool.comfy]` after verifying the minimum ComfyUI version needed for sidebar/settings/commands.
- Add icon/banner URLs if publishing to registry.
- Decide license before registry publication; current `LicenseRef-Proprietary` is honest but limits adoption.

## Product Improvements For Project Settings

### 6. Project status should become a first-class ComfyUI command surface

Recommended features:

- Command: `MajoorPS: Open Project Settings`.
- Command: `MajoorPS: Assign active project to workflow`.
- Command: `MajoorPS: Patch save nodes now`.
- Command: `MajoorPS: Scan missing models`.
- Optional keybindings only for non-conflicting actions.

Why: ComfyUI command palette and keybindings are the current extension integration path.

### 7. Persist project metadata in workflow with a versioned schema

Current workflow signature uses `graph.extra.mjr_project`.

Recommended schema:

```json
{
  "schema_version": 1,
  "project_id": "...",
  "project_folder": "...",
  "template": "...",
  "updated_at": "..."
}
```

Status: fixed in the current working tree with `schema_version: 1`.

### 8. Add a project health panel

Recommended checks:

- Project folder exists.
- Workflow mirror status.
- Missing model count.
- Save nodes already patched vs patchable.
- Last workflow save path.
- Output template preview validity.

Why: this turns the extension from a set of buttons into a reliable project state tool.

### 9. Add dry-run output patching

Status: fixed in the current working tree for the manual "Patch Now" path.

Implemented behavior:

- Show a list of nodes that would be changed.
- Show old path/prefix and new path/prefix.
- Let the user apply all or selected changes.

Why: patching graph nodes is visible state mutation; dry-run makes it predictable.

### 10. Make model download policy explicit in UI

Status: partially fixed in the current working tree.

Current README states all public hosts are allowed by default. The UI now surfaces a concise server-side policy note near the download controls.

Recommended follow-up UI:

- Show current host policy.
- Show private-IP blocking status.
- Show max size.
- Require explicit confirmation for unknown hosts.
- Add per-host allow/deny list editing if settings are available.

Why: download functionality is high trust and should expose its guardrails.

## Engineering Improvements

### 11. Add backend tests for routes, not only validators

Recommended tests:

- Auth/origin/rate limit helpers.
- Project create/list/resolve happy path.
- Template preview rejects traversal and absolute paths.
- Workflow save rejects invalid project/workflow names.
- Archive/unarchive/delete index-only behavior.
- Download URL validation and private IP blocking.

### 12. Split `ui_components.ts` by feature area

Suggested modules:

- `project_panel.ts`
- `workflow_panel.ts`
- `output_template_panel.ts`
- `missing_models_panel.ts`
- `model_registry_panel.ts`
- `project_status.ts`

Why: this is the remaining frontend file with broad responsibility and highest future regression risk.

### 13. Replace repeated ad hoc DOM styling with small helpers

`src/mjr/dom.ts` exists now. Expand it gradually:

- `button()`
- `field()`
- `section()`
- `detailsSection()`
- `statusText()`

Why: keeps vanilla JS/TS while reducing UI duplication. Vue is still not necessary unless the panel becomes much more stateful.

### 14. Add generated file policy

Recommended:

- Keep `src/` as source of truth.
- Keep `web/js/` committed for ComfyUI/Manager install compatibility.
- Optionally stop committing `.map` files if package size/noise matters.
- Keep `.d.ts` only if useful for downstream tooling; otherwise disable declaration emit.

## Suggested Implementation Order

1. Restore `route_utils.py` security helpers and tests.
2. Convert raw Ctrl+S hook into legacy fallback setting.
3. Centralize frontend settings access.
4. Add workflow signature `schema_version`.
5. Add backend route tests for project/template/workflow operations.
6. Add commands for open panel, scan missing models, patch save nodes.
7. Split `ui_components.ts` into feature modules.
8. Add patch dry-run UI.
9. Surface download policy in UI.
10. Prepare registry polish: `requires-comfyui`, license, icon/banner.

## Decision On Vue

Do not migrate to Vue yet.

ComfyUI frontend uses Vue internally, but custom-node extensions are still loaded as browser JS modules through `WEB_DIRECTORY`. The current panel can be improved more safely by splitting modules and using ComfyUI commands/settings/sidebar APIs. Revisit Vue only if the UI becomes a multi-view application with complex reactive state.
