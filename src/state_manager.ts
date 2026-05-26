import type { PersistedRuntimeState, RuntimeState } from "./types/domain.js";

const STORAGE_KEY = "mjr_project_settings_state";

export const DEFAULT_STATE: RuntimeState = {
  projectName: "",
  workflowName: "",
  workflowAsset: "",
  workflowLastBase: "",
  workflowNextSuffix: 1,
  workflowPanelOpen: false,
  projectId: "",
  projectFolder: "",
  projectExists: null,
  autoPatch: true,
  autoPatchNewNodes: true,
  autoSwitchTrusted: false,
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

export let runtimeState: RuntimeState | null = null;

export function setRuntimeState(state: RuntimeState | null) {
  runtimeState = state;
}

export function createRuntimeState(overrides?: PersistedRuntimeState | Record<string, unknown>): RuntimeState {
  return Object.assign({}, DEFAULT_STATE, overrides || {}) as RuntimeState;
}

export function loadState(): PersistedRuntimeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRuntimeState;
  } catch (_) {
    return null;
  }
}

export function saveState(state: RuntimeState) {
  const data: PersistedRuntimeState = {
    projectName: state.projectName,
    workflowName: state.workflowName,
    workflowAsset: state.workflowAsset,
    workflowLastBase: state.workflowLastBase,
    workflowNextSuffix: state.workflowNextSuffix,
    workflowPanelOpen: state.workflowPanelOpen,
    projectId: state.projectId,
    projectFolder: state.projectFolder,
    autoPatch: state.autoPatch,
    autoPatchNewNodes: state.autoPatchNewNodes,
    autoSwitchTrusted: state.autoSwitchTrusted,
    autoHookSave: state.autoHookSave,
    kind: state.kind,
    media: state.media,
    name: state.name,
    modelSelection: state.modelSelection,
    detectedModelTag: state.detectedModelTag,
    useCustomModel: state.useCustomModel,
    customModelText: state.customModelText,
    modelUpper: state.modelUpper,
    pendingProjectName: state.pendingProjectName,
    pendingSelectProjectId: state.pendingSelectProjectId,
    lastRelDir: state.lastRelDir,
    lastPrefix: state.lastPrefix,
    pathTemplate: state.pathTemplate,
    showMoreModels: state.showMoreModels,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}
