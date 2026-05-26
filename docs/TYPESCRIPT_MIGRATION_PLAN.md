# TypeScript Migration Plan

Goal: migrate the frontend progressively from permissive TypeScript output to typed, ComfyUI-aligned modules without breaking `WEB_DIRECTORY = "./web/js"` runtime loading.

## Phase 0 - Baseline

- [x] Move frontend source files from legacy `js/**/*.js` to `src/**/*.ts`.
- [x] Add reproducible TypeScript build with `npm run build`.
- [x] Keep generated browser modules in `web/js/` for ComfyUI.
- [x] Add minimal ComfyUI ambient declarations.
- [x] Register settings through modern `app.registerExtension({ settings })`.
- [x] Keep legacy settings fallback for older ComfyUI builds.
- [x] Document ComfyUI integration audit.
- [x] Verify `npm run build`.
- [x] Verify current validator tests with `unittest`.

## Phase 1 - Shared Types

- [x] Add typed API response contracts for project list, project set, template preview, workflow save, and model tools.
- [x] Add typed runtime state interfaces for persisted state and transient UI callbacks.
- [x] Add typed graph/node/widget interfaces for the subset used by this extension.
- [x] Replace broad object assumptions in `state_manager.ts`.
- [x] Replace broad API payload assumptions in `mjr/api.ts`.

## Phase 2 - Low-Risk Strict Modules

- [x] Remove `noCheck` from `mjr/utils.ts`.
- [x] Remove `noCheck` from `mjr/log.ts`.
- [x] Remove `noCheck` from `mjr/api.ts`.
- [x] Remove `noCheck` from `state_manager.ts`.
- [x] Enable `noImplicitAny` for the low-risk modules above.

## Phase 3 - ComfyUI Integration Hardening

- [x] Move Ctrl+S behavior from raw `keydown` capture toward ComfyUI command/keybinding APIs when available.
- [x] Keep fallback key handling for older ComfyUI builds.
- [x] Type settings IDs and setting reads.
- [x] Type sidebar render callbacks.
- [x] Type dialog and toast adapter return values.

## Phase 4 - Graph And Patch Safety

- [x] Type graph serialization and project signature objects.
- [x] Type save-like node detection.
- [x] Type path widget mutation.
- [x] Add focused tests or browser fixtures for patching representative save nodes.
- [x] Keep all path security validation server-side.

## Phase 5 - UI Decomposition

- [x] Split `ui_components.ts` into smaller modules by panel area.
- [x] Extract shared DOM helpers.
- [x] Type model fixer dialog state.
- [x] Type model downloader dialog state.
- [x] Type model contribution dialog state.
- [x] Re-evaluate Vue only after UI modules are isolated and build output is stable.

## Phase 6 - Strict Project

- [x] Remove `noCheck` from `tsconfig.json`.
- [x] Enable `strict`.
- [x] Keep `skipLibCheck` unless upstream ComfyUI types are added.
- [x] Run `npm run typecheck` in CI or documented release workflow.
- [x] Document frontend build requirements in `README.md`.

## Verification Gates

- [x] `npm run build`
- [x] `npm run typecheck`
- [x] `npm run typecheck:strict`
- [x] `npm run test:frontend`
- [x] `python -m unittest discover -s tests -p "test_*.py"`
- [x] Manual ComfyUI browser load of Project Settings tab.
- [x] Manual workflow load/save smoke test.
- [x] Manual save-node patch smoke test.
