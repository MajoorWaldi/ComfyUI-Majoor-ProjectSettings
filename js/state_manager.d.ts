import type { PersistedRuntimeState, RuntimeState } from "./types/domain.js";
export declare const DEFAULT_STATE: RuntimeState;
export declare let runtimeState: RuntimeState | null;
export declare function setRuntimeState(state: RuntimeState | null): void;
export declare function createRuntimeState(overrides?: PersistedRuntimeState | Record<string, unknown>): RuntimeState;
export declare function loadState(): PersistedRuntimeState | null;
export declare function saveState(state: RuntimeState): void;
