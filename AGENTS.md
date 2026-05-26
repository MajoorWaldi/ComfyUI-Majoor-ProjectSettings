# AGENTS.md

Guidelines for AI agents working on `ComfyUI-Majoor-ProjectSettings`.

## Mandatory Upstream Research

Before answering implementation questions or changing code in this repository, inspect the relevant upstream ComfyUI projects. Do not rely only on memory.

Use these sources:

- ComfyUI core: https://github.com/Comfy-Org/ComfyUI
- ComfyUI frontend: https://github.com/Comfy-Org/ComfyUI_frontend.git
- ComfyUI Manager: https://github.com/Comfy-Org/ComfyUI-Manager
- ComfyUI Desktop: https://github.com/Comfy-Org/desktop
- Comfy-Org overview: https://github.com/Comfy-Org

For each task, check the source that owns the behavior you are touching:

- Extension lifecycle, `app.registerExtension`, graph hooks, node APIs: check ComfyUI core and frontend.
- Sidebar tabs, settings UI, dialogs, menus, theme tokens, component conventions: check ComfyUI frontend.
- Custom node packaging, installation, Manager metadata, compatibility expectations: check ComfyUI Manager.
- Desktop-specific paths, packaged runtime behavior, filesystem constraints: check ComfyUI Desktop.
- Cross-repo direction, renamed packages, current repository layout: check the Comfy-Org organization.

When upstream behavior matters, mention the upstream files or documented patterns used to justify the change.

## Project Scope

This custom node must stay aligned with ComfyUI instead of inventing a separate app architecture.

The extension currently provides:

- A ComfyUI web extension from `js/`.
- Python server routes under `server/`.
- No custom ComfyUI nodes.
- Project-aware output paths under `output/PROJECTS/<project>/`.
- Workflow save, project signature, missing-model tools, and safe path validation.

Keep that contract unless the user explicitly asks for a breaking redesign.

## Frontend Rules

- Prefer ComfyUI frontend APIs and UI patterns over custom framework assumptions.
- Keep compatibility with the way ComfyUI loads `WEB_DIRECTORY` assets.
- If migrating JavaScript to TypeScript, preserve the generated browser modules expected by ComfyUI.
- Do not add Vue, React, Vite, or another framework unless upstream ComfyUI frontend conventions or the requested feature clearly justify it.
- If Vue is introduced, document why it is compatible with ComfyUI extension loading and how the build output is served.
- Use ComfyUI settings, dialogs, sidebar APIs, and graph hooks when available.
- Keep fallback behavior for older ComfyUI versions when this repo already supports it.
- Avoid global state leaks; namespace globals with `mjr` or `Majoor`.
- Browser code must handle missing or changed ComfyUI APIs defensively.

## Backend Rules

- Use ComfyUI server route patterns from upstream.
- Keep routes small and validate all inputs at the boundary.
- Project paths must remain relative to ComfyUI output/project roots.
- Reject absolute paths, drive paths, traversal (`..`), and unsafe separators.
- Preserve JSON error responses with `{ "ok": false, "error": "..." }`.
- Treat model download, URL fetch, and file write features as security-sensitive.
- Keep CSRF, same-origin, API-key, host allowlist, private-IP, and size-limit protections intact.

## Compatibility Checklist

Before finishing a code change, verify:

- ComfyUI can still discover the extension through `WEB_DIRECTORY`.
- The main entry module still registers with `app.registerExtension`.
- Existing hooks such as `setup`, `beforeConfigureGraph`, `afterConfigureGraph`, `beforeQueuePrompt`, and `nodeCreated` still behave as expected.
- Sidebar registration still falls back to the floating panel if needed.
- Existing API endpoints are not renamed unless the README and callers are updated together.
- Workflow JSON signatures remain backward compatible.
- Existing localStorage keys either remain valid or are migrated.

## Refactor Policy

- Prefer small, reviewable refactors.
- Do not mix a formatting-only rewrite with behavioral changes.
- When converting JS to TS, start with type-safe module boundaries and shared domain types.
- Keep generated files clearly separated from source files if a build step is added.
- Add or update scripts so the repo can rebuild frontend assets reproducibly.
- Do not remove plain JS runtime files until ComfyUI loading and packaging are verified.

## Testing And Verification

Use the smallest verification that proves the change:

- Python validation and route logic: run the relevant `pytest` tests.
- Frontend build changes: run the TypeScript/build command.
- UI behavior changes: test inside ComfyUI when possible.
- Path or security changes: add tests for rejected and accepted inputs.
- Download or network changes: test error paths and size/host guards.

If a verification step cannot be run locally, state exactly what was not run and why.

## Documentation

Update docs when behavior changes:

- `README.md` for user-facing features, installation, settings, and endpoints.
- `docs/project_structure.json` when project folder roles change.
- `AGENTS.md` when development workflow or upstream alignment rules change.

Keep documentation practical. Include paths, commands, and compatibility notes rather than broad intent.

## Response Expectations

When replying to user requests:

- Answer in the user's language when practical.
- Be explicit about which upstream ComfyUI source was checked when it affects the answer.
- Prefer implementing requested changes over only proposing them.
- Surface compatibility risks early, especially around ComfyUI frontend loading, Manager packaging, Desktop paths, and security-sensitive server routes.
