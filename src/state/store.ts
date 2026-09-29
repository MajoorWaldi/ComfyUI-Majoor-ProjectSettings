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

// ─── Storage key ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "mjr_project_settings_state";

// ─── Default state ────────────────────────────────────────────────────────────

export const DEFAULT_STATE: RuntimeState = {
  projectName: "",
  workflowName: "",
  workflowAsset: "",
  workflowLastBase: "",
  workflowNextSuffix: 1,
  workflowPanelOpen: false,
  activeTab: "project",
  projectId: "",
  projectFolder: "",
  projectExists: null,
  autoPatch: true,
  autoPatchNewNodes: true,
  autoSwitchTrusted: true,
  autoHookSave: true,
  kind: "asset",
  media: "images",
  name: "",
  modelSelection: "",
  detectedModelTag: "",
  useCustomModel: false,
  customModelText: "",
  modelUpper: false,
  pendingProjectName: "",
  pendingSelectProjectId: "",
  lastRelDir: "",
  lastPrefix: "",
  pathTemplate: "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}",
  showMoreModels: false,
  lastError: "",
  detected: null,
  workflowHasSignature: false,
  workflowChecked: false,
  isGraphLoading: false,
  graphLoadToken: 0,
  graphIsEmpty: false,
};

// ─── Internal state ───────────────────────────────────────────────────────────

let _state: RuntimeState = { ...DEFAULT_STATE };
let _initialized = false;

// ─── EventEmitter ─────────────────────────────────────────────────────────────

type Listener = () => void;
const _listeners = new Set<Listener>();

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Notify all subscribers (called automatically by setState). */
export function notify(): void {
  for (const fn of _listeners) {
    try {
      fn();
    } catch (err) {
      console.error("[mjr] store listener error:", err);
    }
  }
}

// ─── State accessors ──────────────────────────────────────────────────────────

/** Get the current runtime state (read-only reference). */
export function getState(): RuntimeState {
  return _state;
}

/**
 * Update state fields, persist to localStorage, and notify all subscribers.
 * Only the fields present in `patch` are updated.
 */
export function setState(patch: Partial<RuntimeState>): void {
  Object.assign(_state, patch);
  _persist();
  notify();
}

/**
 * Replace the entire state (e.g. on initial load).
 * Use setState() for partial updates.
 */
export function initState(overrides: PersistedRuntimeState | Record<string, unknown> = {}): RuntimeState {
  _state = Object.assign({}, DEFAULT_STATE, overrides) as RuntimeState;
  _initialized = true;
  return _state;
}

/** True once initState() has been called. */
export function isInitialized(): boolean {
  return _initialized;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/** Load persisted state from localStorage. Returns null if nothing stored. */
export function loadPersistedState(): PersistedRuntimeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as PersistedRuntimeState;
  } catch (_) {
    return null;
  }
}

/** Persist current state to localStorage (called automatically by setState). */
function _persist(): void {
  const s = _state;
  const data: PersistedRuntimeState = {
    projectName: s.projectName,
    workflowName: s.workflowName,
    workflowAsset: s.workflowAsset,
    workflowLastBase: s.workflowLastBase,
    workflowNextSuffix: s.workflowNextSuffix,
    workflowPanelOpen: s.workflowPanelOpen,
    projectId: s.projectId,
    projectFolder: s.projectFolder,
    autoPatch: s.autoPatch,
    autoPatchNewNodes: s.autoPatchNewNodes,
    autoSwitchTrusted: s.autoSwitchTrusted,
    autoHookSave: s.autoHookSave,
    kind: s.kind,
    media: s.media,
    name: s.name,
    modelSelection: s.modelSelection,
    detectedModelTag: s.detectedModelTag,
    useCustomModel: s.useCustomModel,
    customModelText: s.customModelText,
    modelUpper: s.modelUpper,
    pendingProjectName: s.pendingProjectName,
    pendingSelectProjectId: s.pendingSelectProjectId,
    lastRelDir: s.lastRelDir,
    lastPrefix: s.lastPrefix,
    pathTemplate: s.pathTemplate,
    showMoreModels: s.showMoreModels,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

// ─── Legacy compat shims ──────────────────────────────────────────────────────
// These preserve backward compat with code that still imports from state_manager.ts

/** @deprecated Use getState() */
export let runtimeState: RuntimeState | null = null;

/** @deprecated Internal — kept for backward compat; use initState() + getState() */
export function setRuntimeState(state: RuntimeState | null): void {
  if (state) {
    _state = state;
    runtimeState = state;
  }
}

/** @deprecated Use initState() */
export function createRuntimeState(overrides?: PersistedRuntimeState | Record<string, unknown>): RuntimeState {
  return Object.assign({}, DEFAULT_STATE, overrides || {}) as RuntimeState;
}

/** @deprecated Use loadPersistedState() */
export function loadState(): PersistedRuntimeState | null {
  return loadPersistedState();
}

/** @deprecated Use setState() */
export function saveState(state: RuntimeState): void {
  _state = state;
  runtimeState = state;
  _persist();
}
