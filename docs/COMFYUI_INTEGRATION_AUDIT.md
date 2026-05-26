# ComfyUI Integration Audit

Date: 2026-05-26

## Upstream Sources Checked

- `Comfy-Org/ComfyUI`
  - Custom node example confirms `WEB_DIRECTORY` is still the runtime contract for frontend extension assets.
  - The current core repository hosts compiled frontend assets under `web/`, while frontend sources live separately.
- `Comfy-Org/ComfyUI_frontend`
  - The official frontend is TypeScript/Vue-based.
  - Extension APIs include `app.registerExtension`, sidebar tabs, commands, keybindings, settings, toast, and desktop-safe dialogs.
  - Settings should prefer `app.registerExtension({ settings: [...] })` plus `app.extensionManager.setting.get(...)`, with legacy `app.ui.settings` only as fallback.
- `Comfy-Org/ComfyUI-Manager`
  - Custom node packages should not assume their folder name.
  - Manager and registry workflows expect reproducible package metadata and install-time scripts from the package root.
- `Comfy-Org/desktop`
  - Desktop runs ComfyUI in an Electron environment, so browser-only APIs need ComfyUI dialog/toast fallbacks.

## Current Repository Findings

- The extension intentionally exposes no ComfyUI nodes.
- `__init__.py` keeps `WEB_DIRECTORY = "./web/js"`, matching the current ComfyUI custom-node docs.
- The frontend was previously maintained directly as browser JavaScript in legacy `js/`.
- UI code already uses ComfyUI sidebar registration when available and a floating fallback for older versions.
- Dialog helpers already prefer `app.extensionManager.dialog` before browser prompt/confirm, which is aligned with desktop guidance.
- Toast helpers already prefer `app.extensionManager.toast`.
- Settings registration used the legacy `app.ui.settings.addSetting` path only.

## Changes Made

- Added TypeScript source tree under `src/`.
- Kept generated runtime modules under `web/js/` so ComfyUI loading remains aligned with current custom-node docs.
- Added `package.json`, `package-lock.json`, and `tsconfig.json`.
- Added local ComfyUI module declarations in `src/types/comfyui.d.ts`.
- Added build scripts:
  - `npm run build`
  - `npm run typecheck`
- Migrated all previous legacy `js/**/*.js` source files to `src/**/*.ts`.
- Rebuilt `web/js/**/*.js` from TypeScript.
- Added modern ComfyUI settings integration through `app.registerExtension({ settings: [...] })`.
- Kept a legacy `app.ui.settings.addSetting` fallback for older ComfyUI versions.
- Updated setting reads to prefer `app.extensionManager.setting.get(...)`.

## Vue Decision

Vue was not introduced in this pass.

Reason: ComfyUI frontend itself uses Vue internally, but custom node frontend assets are still loaded through `WEB_DIRECTORY` as extension modules. This repository already has a large DOM-built UI and no existing bundler. Introducing Vue would require bundling, dependency packaging, and lifecycle glue without improving compatibility immediately.

Recommended next step if Vue is desired:

- Split the Project Settings panel into small UI domains first.
- Add a Vite/Vue build only after confirming the generated bundle loads cleanly from `WEB_DIRECTORY`.
- Keep the ComfyUI extension entry as a thin adapter around `app.registerExtension`.

## Remaining Risks

- TypeScript currently builds with `noCheck: true` because the old JavaScript is highly dynamic and depends on untyped ComfyUI internals.
- Generated `.d.ts` files are emitted for future typing work but are not consumed by ComfyUI.
- Full browser verification inside ComfyUI is still required after this migration.
- The UI is still large and imperative; future refactors should target typed API payloads and smaller panel modules before changing framework.

## Recommended Next Refactors

- Add shared TypeScript types for project state, API responses, missing-model scan results, and graph widget shapes.
- Tighten `tsconfig.json` gradually by removing `noCheck` module by module.
- Move repeated DOM helpers out of `ui_components.ts`.
- Consider registering commands/keybindings through ComfyUI's command/keybinding API instead of a raw capture-phase `keydown` listener for `Ctrl+S`.
- Add Manager/registry metadata once package publishing is planned.
