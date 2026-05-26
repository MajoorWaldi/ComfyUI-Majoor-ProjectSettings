export type ProjectMedia = "images" | "videos" | "other" | string;

export interface ProjectListEntry {
  project_id: string;
  folder?: string;
  exists?: boolean;
  archived?: boolean;
  [key: string]: unknown;
}

export interface ProjectListResponse {
  ok?: boolean;
  projects?: ProjectListEntry[];
  [key: string]: unknown;
}

export interface ProjectSetResponse {
  ok?: boolean;
  project_id: string;
  project_folder: string;
  [key: string]: unknown;
}

export interface ProjectResolveResponse {
  ok?: boolean;
  project_id?: string;
  [key: string]: unknown;
}

export interface TemplatePreviewResponse {
  ok?: boolean;
  path?: string;
  rel_dir?: string;
  prefix?: string;
  [key: string]: unknown;
}

export interface WorkflowSavePayload {
  project_id: string;
  workflow_name: string;
  workflow: unknown;
  overwrite?: boolean;
  mirror_to_comfy_workflows?: boolean;
  use_project_subfolder_in_workflows?: boolean;
  asset_folder?: string;
}

export interface WorkflowSaveResponse {
  ok?: boolean;
  file?: string;
  project_rel_path?: string;
  workflow_rel_dir?: string;
  comfy_workflow_rel?: string;
  mirrored?: boolean;
  mirror_error?: string;
  [key: string]: unknown;
}

export interface ModelToolResponse {
  ok?: boolean;
  items?: unknown[];
  missing?: unknown[];
  results?: unknown[];
  entries?: unknown[];
  candidates?: unknown[];
  recipes?: unknown[];
  job_id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface DetectedProject {
  mode: "none" | "signature" | "path" | string;
  project_folder: string;
  project_id: string;
  confidence: number;
}

export interface RuntimeUiCallbacks {
  updateStatus?: () => void | Promise<void>;
  updateResolve?: () => void | Promise<void>;
  updateWorkflowBlock?: () => void | Promise<void>;
  updateTargetLabel?: () => void | Promise<void>;
  refreshExistingNames?: () => void | Promise<void>;
  refreshMissingStatus?: () => void | Promise<void>;
  updatePreview?: () => void | Promise<void>;
  resetForProjectChange?: () => void;
  refreshProjectsList?: (force?: boolean) => void | Promise<void>;
  buildWorkflowName?: () => string;
  setWorkflowName?: (name: string) => void;
}

export interface RuntimeState {
  projectName: string;
  workflowName: string;
  workflowAsset: string;
  workflowLastBase: string;
  workflowNextSuffix: number;
  workflowPanelOpen: boolean;
  projectId: string;
  projectFolder: string;
  projectExists: boolean | null;
  autoPatch: boolean;
  autoPatchNewNodes: boolean;
  autoSwitchTrusted: boolean;
  autoHookSave: boolean;
  kind: string;
  media: ProjectMedia;
  name: string;
  modelSelection: string;
  detectedModelTag: string;
  useCustomModel: boolean;
  customModelText: string;
  modelUpper: boolean;
  pendingProjectName: string;
  pendingSelectProjectId: string;
  lastRelDir: string;
  lastPrefix: string;
  pathTemplate: string;
  showMoreModels: boolean;
  lastError: string;
  detected: DetectedProject | null;
  workflowHasSignature: boolean;
  workflowChecked: boolean;
  isGraphLoading: boolean;
  graphLoadToken: number;
  graphIsEmpty: boolean;
  customModel?: string;
  _ui?: RuntimeUiCallbacks;
  _emptyGraphPromptToken?: number | null;
}

export type PersistedRuntimeState = Partial<
  Pick<
    RuntimeState,
    | "projectName"
    | "workflowName"
    | "workflowAsset"
    | "workflowLastBase"
    | "workflowNextSuffix"
    | "workflowPanelOpen"
    | "projectId"
    | "projectFolder"
    | "autoPatch"
    | "autoPatchNewNodes"
    | "autoSwitchTrusted"
    | "autoHookSave"
    | "kind"
    | "media"
    | "name"
    | "modelSelection"
    | "detectedModelTag"
    | "useCustomModel"
    | "customModelText"
    | "modelUpper"
    | "pendingProjectName"
    | "pendingSelectProjectId"
    | "lastRelDir"
    | "lastPrefix"
    | "pathTemplate"
    | "showMoreModels"
  >
>;

export interface ComfyWidget {
  name?: string;
  value?: unknown;
  options?: {
    values?: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ComfyNode {
  type?: string;
  title?: string;
  widgets?: ComfyWidget[];
  [key: string]: unknown;
}

