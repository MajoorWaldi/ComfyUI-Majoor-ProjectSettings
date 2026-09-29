/**
 * Reactive state store for Majoor Project Settings.
 *
 * Replaces the fragile `_ui` callback bag on RuntimeState.
 * Any UI component can subscribe to state changes and re-render
 * itself when notified — no framework needed.
 *
 * Usage:
 *   import { getState, setState, subscribe } from "./state/store.js";
 *
 *   // Subscribe (returns unsubscribe fn)
 *   const unsub = subscribe(() => { ... re-render ... });
 *
 *   // Update state + persist + notify all subscribers
 *   setState({ projectId: "abc", projectFolder: "MyProject" });
 */
import type { PersistedRuntimeState, RuntimeState } from "../types/domain.js";
export declare const DEFAULT_STATE: RuntimeState;
type Listener = () => void;
/** Subscribe to state changes. Returns an unsubscribe function. */
export declare function subscribe(fn: Listener): () => void;
/** Notify all subscribers (called automatically by setState). */
export declare function notify(): void;
/** Get the current runtime state (read-only reference). */
export declare function getState(): RuntimeState;
/**
 * Update state fields, persist to localStorage, and notify all subscribers.
 * Only the fields present in `patch` are updated.
 */
export declare function setState(patch: Partial<RuntimeState>): void;
/**
 * Replace the entire state (e.g. on initial load).
 * Use setState() for partial updates.
 */
export declare function initState(overrides?: PersistedRuntimeState | Record<string, unknown>): RuntimeState;
/** True once initState() has been called. */
export declare function isInitialized(): boolean;
/** Load persisted state from localStorage. Returns null if nothing stored. */
export declare function loadPersistedState(): PersistedRuntimeState | null;
/** @deprecated Use getState() */
export declare let runtimeState: RuntimeState | null;
/** @deprecated Internal — kept for backward compat; use initState() + getState() */
export declare function setRuntimeState(state: RuntimeState | null): void;
/** @deprecated Use initState() */
export declare function createRuntimeState(overrides?: PersistedRuntimeState | Record<string, unknown>): RuntimeState;
/** @deprecated Use loadPersistedState() */
export declare function loadState(): PersistedRuntimeState | null;
/** @deprecated Use setState() */
export declare function saveState(state: RuntimeState): void;
export {};
