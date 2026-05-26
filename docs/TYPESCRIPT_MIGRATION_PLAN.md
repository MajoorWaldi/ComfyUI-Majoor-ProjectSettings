# TypeScript Migration Plan

Goal: migrate the frontend progressively from permissive TypeScript output to typed, ComfyUI-aligned modules without breaking `WEB_DIRECTORY = "./js"` runtime loading.

## Phase 0 - Baseline

- [x] Move frontend source files from `js/**/*.js` to `src/**/*.ts`.
- [x] Add reproducible TypeScript build with `npm run build`.
- [x] Keep generated browser modules in `js/` for ComfyUI.
- [x] Add minimal ComfyUI ambient declarations.
- [x] Register settings through modern `app.registerExtension({ settings })`.
- [x] Keep legacy settings fallback for older ComfyUI builds.
- [x] Document ComfyUI integration audit.
- [x] Verify `npm run build`.
- [x] Verify current validator tests with `unittest`.

## Phase 1 - Shared Types

- [ ] Add typed API response contracts for project list, project set, template preview, workflow save, and model tools.
- [ ] Add typed runtime state interfaces for persisted state and transient UI callbacks.
- [ ] Add typed graph/node/widget interfaces for the subset used by this extension.
- [ ] Replace broad object assumptions in `state_manager.ts`.
- [ ] Replace broad API payload assumptions in `mjr/api.ts`.

## Phase 2 - Low-Risk Strict Modules

- [ ] Remove `noCheck` from `mjr/utils.ts`.
- [ ] Remove `noCheck` from `mjr/log.ts`.
- [ ] Remove `noCheck` from `mjr/api.ts`.
- [ ] Remove `noCheck` from `state_manager.ts`.
- [ ] Enable `noImplicitAny` for the low-risk modules above.

## Phase 3 - ComfyUI Integration Hardening

- [ ] Move Ctrl+S behavior from raw `keydown` capture toward ComfyUI command/keybinding APIs when available.
- [ ] Keep fallback key handling for older ComfyUI builds.
- [ ] Type settings IDs and setting reads.
- [ ] Type sidebar render callbacks.
- [ ] Type dialog and toast adapter return values.

## Phase 4 - Graph And Patch Safety

- [ ] Type graph serialization and project signature objects.
- [ ] Type save-like node detection.
- [ ] Type path widget mutation.
- [ ] Add focused tests or browser fixtures for patching representative save nodes.
- [ ] Keep all path security validation server-side.

## Phase 5 - UI Decomposition

- [ ] Split `ui_components.ts` into smaller modules by panel area.
- [ ] Extract shared DOM helpers.
- [ ] Type model fixer dialog state.
- [ ] Type model downloader dialog state.
- [ ] Type model contribution dialog state.
- [ ] Re-evaluate Vue only after UI modules are isolated and build output is stable.

## Phase 6 - Strict Project

- [ ] Remove `noCheck` from `tsconfig.json`.
- [ ] Enable `strict`.
- [ ] Keep `skipLibCheck` unless upstream ComfyUI types are added.
- [ ] Run `npm run typecheck` in CI or documented release workflow.
- [ ] Document frontend build requirements in `README.md`.

## Verification Gates

- [ ] `npm run build`
- [ ] `npm run typecheck`
- [ ] `python -m unittest discover -s tests -p "test_*.py"`
- [ ] Manual ComfyUI browser load of Project Settings tab.
- [ ] Manual workflow load/save smoke test.
- [ ] Manual save-node patch smoke test.
