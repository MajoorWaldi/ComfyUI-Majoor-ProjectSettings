/**
 * Majoor Project Settings — extension entry point.
 *
 * Responsibilities of this file (only wiring):
 *   1. Declare extension settings, commands, menu commands.
 *   2. In setup(): initialise state, register sidebar tab, attach graph listeners.
 *   3. Lifecycle hooks: beforeConfigureGraph, afterConfigureGraph,
 *      beforeQueuePrompt, nodeCreated.
 *
 * All business logic lives in dedicated modules:
 *   - state/store.ts            → reactive state + persistence
 *   - mjr/api.ts                → REST calls
 *   - mjr/ws_events.ts          → WebSocket push events
 *   - mjr/graph.ts              → graph inspection
 *   - mjr/patch.ts              → save-node patching
 *   - mjr/toast.ts              → notifications
 *   - mjr/dialog.ts             → prompts / confirms
 *   - mjr/settings.ts           → extensionManager.setting bridge
 *   - mjr/topbar_badge.ts       → topbar health badge
 *   - ui_components.ts          → panel rendering
 *   - ui/styles.ts              → CSS injection
 */
import type { RuntimeState, ProjectListEntry } from "./types/domain.js";
export declare function setActiveProjectById(state: RuntimeState, projectId: string, token?: number | null, { skipFreshPaths }?: {
    skipFreshPaths?: boolean;
}): Promise<ProjectListEntry | null>;
export declare function createAndActivateProject(state: RuntimeState, projectName: string, _updateCallbacks: Record<string, unknown>): Promise<unknown>;
export declare function saveWorkflowToProject(state: RuntimeState, nameOverride?: string): Promise<void>;
