/**
 * state_manager.ts — backward-compat re-export shim.
 *
 * All logic has moved to src/state/store.ts.
 * This file exists so existing imports keep working without changes.
 *
 * @deprecated Import directly from "./state/store.js" for new code.
 */
export { DEFAULT_STATE, runtimeState, setRuntimeState, createRuntimeState, loadState, saveState, getState, setState, subscribe, notify, initState, isInitialized, loadPersistedState, } from "./state/store.js";
