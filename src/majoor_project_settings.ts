/**
 * Majoor Project Settings (standalone)
 * - Sidebar UI when available (fallback floating panel)
 * - No nodes, no polling
 */

import { app } from "../../scripts/app.js";
import { extractDateFromPath, joinRel, mediaDir, replaceDateInPath, token3Tag, yymmddJS } from "./mjr/utils.js";
import { toast } from "./mjr/toast.js";
import { fetchJSON, saveWorkflow, tryResolveProjectId } from "./mjr/api.js";
import { psConfirm, psPrompt } from "./mjr/dialog.js";
import {
  detectModelFromGraph,
  extractGraphOutputMetadata,
  getSerializedWorkflow,
  inferProjectFolderFromGraph,
  readGraphSignature,
} from "./mjr/graph.js";
import {
  PATH_WIDGETS,
  alreadyProjectPathed,
  detectNodeMedia,
  isSaveLikeNode,
  loadConfig,
  patchSaveNodes,
  previewPatchSaveNodes,
  patchSingleNode,
  stampGraphProjectSignature,
} from "./mjr/patch.js";
import { buildPanel } from "./ui_components.js";
import { updateMenuStatusBadge } from "./mjr/topbar_badge.js";
import {
  createRuntimeState,
  loadState,
  saveState,
  runtimeState,
  setRuntimeState,
} from "./state_manager.js";
import { scanMissingModelsWithStats } from "./mjr/model_fixer.js";
import type { RuntimeState, SettingDefinition, SettingId, SidebarRenderOptions, ComfyNode } from "./types/domain.js";
import { getSettingBool, toBool, toNumber } from "./mjr/settings.js";

let workflowShortcutRegistered = false;

const COMMAND_SAVE_WORKFLOW_TO_PROJECT = "mjr.projectSettings.saveWorkflowToProject";
const COMMAND_OPEN_PANEL = "mjr.projectSettings.openPanel";
const COMMAND_ASSIGN_ACTIVE_PROJECT = "mjr.projectSettings.assignActiveProject";
const COMMAND_SCAN_MISSING_MODELS = "mjr.projectSettings.scanMissingModels";
const COMMAND_PATCH_SAVE_NODES = "mjr.projectSettings.patchSaveNodes";
const NODE_PATCH_RETRY_DELAY_MS = 60;
const NODE_PATCH_MAX_RETRIES = 1;
const SETTINGS_CATEGORY = ["MajoorPS"];
const CATEGORY_NOTIFICATIONS = ["MajoorPS", "Notifications"];
const CATEGORY_PROJECTS = ["MajoorPS", "Projects & Workflows"];
const CATEGORY_MODELS = ["MajoorPS", "Models & Downloads"];

const DOWNLOAD_MAX_GB_SETTING: SettingId = "mjr_project.download_max_gb";
const DEFAULT_DOWNLOAD_MAX_GB = 50;
const AUTO_FIX_AFTER_DOWNLOAD_SETTING: SettingId = "mjr_project.auto_fix_after_download";
const AUTO_OPEN_PANEL_ON_MISSING_SETTING: SettingId = "mjr_project.auto_open_panel_on_missing";
const AUTO_SCAN_MISSING_ON_OPEN_SETTING: SettingId = "mjr_project.auto_scan_missing_on_open";
const PROMPT_EMPTY_GRAPH_SETTING: SettingId = "mjr_project.prompt_empty_graph";
const AUTO_REMEMBER_NOTE_SOURCES_SETTING: SettingId = "mjr_project.auto_remember_note_sources";
const NO_PROJECT_STATUS_BLACK_SETTING: SettingId = "mjr_project.status_black_no_project";
const LEGACY_CTRL_S_HOOK_SETTING: SettingId = "mjr_project.legacy_ctrl_s_hook";
const TOAST_VERBOSE_SETTING: SettingId = "mjr_project.toast_verbose";
const AUTO_PATCH_NEW_NODES_SETTING: SettingId = "mjr_project.auto_patch_new_nodes";
const AUTO_SWITCH_TRUSTED_SETTING: SettingId = "mjr_project.auto_switch_trusted";
const AUTO_HOOK_SAVE_SETTING: SettingId = "mjr_project.auto_hook_save";
const AUTO_PATCH_SETTING: SettingId = "mjr_project.auto_patch";

const DEFAULT_AUTO_FIX_AFTER_DOWNLOAD = true;
const DEFAULT_AUTO_OPEN_PANEL = false;
const DEFAULT_AUTO_SCAN_MISSING_ON_OPEN = true;
const DEFAULT_PROMPT_EMPTY_GRAPH = false;
const DEFAULT_AUTO_REMEMBER_NOTE_SOURCES = true;
const DEFAULT_NO_PROJECT_STATUS_BLACK = false;
const DEFAULT_LEGACY_CTRL_S_HOOK = false;
const DEFAULT_TOAST_VERBOSE = false;
const DEFAULT_AUTO_PATCH_NEW_NODES = true;
const DEFAULT_AUTO_SWITCH_TRUSTED = true;
const DEFAULT_AUTO_HOOK_SAVE = true;
const DEFAULT_AUTO_PATCH = true;

function _rollOutputDateIfNeeded(state: RuntimeState, patchCanvas: boolean = false): boolean {
  if (!state) return false;
  const today = yymmddJS();
  const prefixExt = extractDateFromPath(state.lastPrefix);
  const relDirExt = extractDateFromPath(state.lastRelDir);

  const oldDate = prefixExt?.yymmdd || relDirExt?.yymmdd;
  if (!oldDate || oldDate === today) return false;

  let changed = false;
  if (state.lastRelDir) {
    const rolledRelDir = replaceDateInPath(state.lastRelDir, today);
    if (rolledRelDir !== state.lastRelDir) {
      state.lastRelDir = rolledRelDir;
      changed = true;
    }
  }
  if (state.lastPrefix) {
    const rolledPrefix = replaceDateInPath(state.lastPrefix, today);
    if (rolledPrefix !== state.lastPrefix) {
      state.lastPrefix = rolledPrefix;
      changed = true;
    }
  }

  if (changed) {
    saveState(state);
    updateUI(state);

    if (patchCanvas || state.autoPatch !== false) {
      try {
        void patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media);
      } catch (err) {
        console.warn("[mjr] Failed to auto-patch save nodes after date roll:", err);
      }
    }
    return true;
  }
  return false;
}

function updateUI(state: RuntimeState): void {
  const safe = (fn: (() => unknown) | undefined, label: string) => {
    try {
      const result = fn?.() as Promise<unknown> | unknown;
      if (result && typeof (result as Promise<unknown>).then === "function") {
        (result as Promise<unknown>).catch((err: unknown) => {
          console.error(`[mjr] UI update failed: ${label}`, err);
          if (label === "status") {
            toast("error", "UI Error", `Failed to update ${label}`, { life: 3000 });
          }
        });
      }
    } catch (err: unknown) {
      console.error(`[mjr] UI update failed: ${label}`, err);
      // Show critical errors to user
      if (label === "status") {
        toast("error", "UI Error", `Failed to update ${label}`, { life: 3000 });
      }
    }
  };
  safe(state?._ui?.updateStatus, "status");
  safe(state?._ui?.updateResolve, "resolve");
  safe(state?._ui?.updateWorkflowBlock, "workflow");
  safe(state?._ui?.updateTargetLabel, "target label");
  safe(state?._ui?.refreshExistingNames, "existing names");
  safe(state?._ui?.refreshMissingStatus, "missing models");
  safe(state?._ui?.updatePreview, "preview");
}

async function setActiveProjectById(state: RuntimeState, projectId: string, token?: number | null) {
  const resp = await fetchJSON("/mjr_project/list");
  const list = resp.projects || [];
  const entry = list.find((p: { project_id?: string }) => p.project_id === projectId);
  if (!entry) {
    throw new Error("project not found");
  }
  if (token != null && state?.graphLoadToken !== token) {
    return null;
  }
  state.projectId = entry.project_id;
  state.projectFolder = entry.folder || "";
  state.projectExists = entry.exists !== false;
  state.lastError = "";
  _rollOutputDateIfNeeded(state);
  saveState(state);
  updateUI(state);
  state?._ui?.resetForProjectChange?.();

  // Auto-patch output nodes when project is opened
  try {
    let relDir = state.lastRelDir || "";
    let prefix = state.lastPrefix || "";
    if (entry.folder && relDir.includes("PROJECTS/")) {
      relDir = relDir.replace(/PROJECTS\/[^/]+/i, `PROJECTS/${entry.folder}`);
      state.lastRelDir = relDir;
    }
    if (entry.folder && prefix.includes("PROJECTS/")) {
      prefix = prefix.replace(/PROJECTS\/[^/]+/i, `PROJECTS/${entry.folder}`);
      state.lastPrefix = prefix;
    }
    if (relDir || prefix) {
      const patched = await patchSaveNodes(app, relDir, prefix);
      if (patched > 0) {
        console.log(`[mjr] Auto-patched ${patched} save node(s) with project outputs`);
      }
    }
  } catch (err) {
    console.error("[mjr] Failed to auto-patch nodes on project open:", err);
  }

  toast("success", "Project active", entry.folder || entry.project_id);
  return entry;
}

/**
 * Shared function to create and activate a project.
 * Eliminates code duplication across multiple create buttons.
 */
async function createAndActivateProject(state: RuntimeState, projectName: string, updateCallbacks: ReturnType<typeof buildUpdateCallbacks>) {
  const {
    updateStatus,
    updateResolve,
    updateWorkflowBlock,
    resetForProjectChange,
    updatePreview,
    refreshProjectsList,
  } = updateCallbacks;

  const resp = await fetchJSON("/mjr_project/set", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_name: projectName, create_base: true }),
  });

  state.projectName = projectName;
  state.projectId = resp.project_id;
  state.projectFolder = resp.project_folder;
  state.projectExists = true;
  state.lastError = "";
  state.workflowHasSignature = true;

  updateStatus();
  updateResolve();
  updateWorkflowBlock();
  saveState(state);
  resetForProjectChange();
  await updatePreview();
  refreshProjectsList(true);
  stampGraphProjectSignature(app, state);

  // Auto-patch output nodes when project is created
  try {
    const relDir = state.lastRelDir || "";
    const prefix = state.lastPrefix || "";
    if (relDir || prefix) {
      const patched = await patchSaveNodes(app, relDir, prefix);
      if (patched > 0) {
        console.log(`[mjr] Auto-patched ${patched} save node(s) after project creation`);
      }
    }
  } catch (err) {
    console.error("[mjr] Failed to auto-patch nodes on project creation:", err);
  }

  toast("success", "Project created", resp.project_folder);

  return resp;
}

const buildUpdateCallbacks = (state: RuntimeState) => {
  const ui = state?._ui || {};
  return {
    updateStatus: ui.updateStatus || (() => {}),
    updateResolve: ui.updateResolve || (() => {}),
    updateWorkflowBlock: ui.updateWorkflowBlock || (() => {}),
    resetForProjectChange: ui.resetForProjectChange || (() => {}),
    updatePreview: ui.updatePreview || (async () => {}),
    refreshProjectsList: ui.refreshProjectsList || (() => {}),
  };
};

async function promptEmptyGraphProject(state: RuntimeState, runToken: number) {
  if (!state || state.projectId) return;
  if (state._emptyGraphPromptToken === runToken) return;
  state._emptyGraphPromptToken = runToken;

  const confirmCreate = await psConfirm({
    title: "Empty workflow",
    message: "This workflow is empty. Create a new project now?\nCancel to set an existing project.",
  });
  if (state.graphLoadToken !== runToken) return;

  if (confirmCreate) {
    const entered = await psPrompt({
      title: "Project name",
      message: "Enter a project name",
      defaultValue: state.pendingProjectName || "",
    });
    if (state.graphLoadToken !== runToken) return;
    if (entered === null) return;
    const projectName = String(entered || "").trim();
    if (!projectName) return;
    await createAndActivateProject(state, projectName, buildUpdateCallbacks(state));
    return;
  }

  state.workflowPanelOpen = true;
  saveState(state);
  updateUI(state);
  state._ui?.refreshProjectsList?.(true);
}

const isGraphCurrentlyEmpty = () => {
  const nodes = app?.graph?._nodes;
  return !Array.isArray(nodes) || nodes.length === 0;
};

function handleGraphEmptyTransition(state: RuntimeState, runToken: number | null, currentEmpty: boolean): boolean {
  if (!state) return false;
  const wasEmpty = Boolean(state.graphIsEmpty);
  if (wasEmpty === currentEmpty) {
    if (!currentEmpty) {
      state._emptyGraphPromptToken = null;
    }
    return false;
  }
  state.graphIsEmpty = currentEmpty;
  if (!currentEmpty) {
    state._emptyGraphPromptToken = null;
  } else if (getSettingBool(PROMPT_EMPTY_GRAPH_SETTING, DEFAULT_PROMPT_EMPTY_GRAPH)) {
    void promptEmptyGraphProject(state, runToken ?? state.graphLoadToken);
  }
  return true;
}

function checkGraphEmptyState(state: RuntimeState, runToken?: number | null): void {
  if (!state) return;
  const empty = isGraphCurrentlyEmpty();
  if (handleGraphEmptyTransition(state, runToken ?? state.graphLoadToken, empty)) {
    saveState(state);
    updateUI(state);
  }
}

function attachGraphEventListeners(state: RuntimeState): void {
  if (!state) return;
  checkGraphEmptyState(state);

  const graph = app?.graph as (typeof app.graph & { __mjr_listeners_attached?: boolean }) | undefined;
  if (!graph || graph.__mjr_listeners_attached) return;
  graph.__mjr_listeners_attached = true;

  let modelCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  const debouncedCheckModel = () => {
    if (modelCheckTimeout) clearTimeout(modelCheckTimeout);
    modelCheckTimeout = setTimeout(() => {
      try {
        if (!state || state.isGraphLoading) return;
        const tag = detectModelFromGraph(token3Tag) || "";
        if (tag && tag !== state.detectedModelTag) {
          state.detectedModelTag = tag;
          saveState(state);
          updateUI(state);
        }
      } catch (_) {}
    }, 150);
  };

  const origOnNodeAdded = graph.onNodeAdded;
  graph.onNodeAdded = function () {
    const res = origOnNodeAdded ? origOnNodeAdded.apply(this, arguments as unknown as [unknown]) : undefined;
    checkGraphEmptyState(state);
    debouncedCheckModel();
    return res;
  };

  const origOnNodeRemoved = graph.onNodeRemoved;
  graph.onNodeRemoved = function () {
    const res = origOnNodeRemoved ? origOnNodeRemoved.apply(this, arguments as unknown as [unknown]) : undefined;
    checkGraphEmptyState(state);
    debouncedCheckModel();
    return res;
  };
}

async function onGraphLoadedDetectProject(state: RuntimeState, token: number) {
  if (!state) return;
  await loadConfig();
  const runToken = typeof token === "number" ? token : state.graphLoadToken || 0;
  const isStale = () => state.graphLoadToken !== runToken;
  const graphNodes = app?.graph?._nodes;
  const graphEmpty = !Array.isArray(graphNodes) || graphNodes.length === 0;
  const guardToast = (type: Parameters<typeof toast>[0], title: string, message: string, opts?: Parameters<typeof toast>[3]) => {
    if (!isStale() && !graphEmpty) {
      toast(type, title, message, opts);
    }
  };
  if (isStale()) return;

  // Collect all state mutations in local variables
  let workflowHasSignature = false;
  const workflowChecked = true;
  let pendingProjectName = state.pendingProjectName || "";
  let pendingSelectProjectId = state.pendingSelectProjectId || "";
  let detected = {
    mode: "none",
    project_folder: "",
    project_id: "",
    confidence: 0,
  };
  let detectedModelTag = state.detectedModelTag || "";
  let lastError = "";

  const outputMeta = !graphEmpty ? extractGraphOutputMetadata(isSaveLikeNode) : null;

  if (!graphEmpty) {
    const sig = readGraphSignature();
    if (sig && (sig.project_id || sig.project_folder)) {
      detected.mode = "signature";
      detected.project_id = String(sig.project_id || "");
      detected.project_folder = String(sig.project_folder || "");
      detected.confidence = 100;
      workflowHasSignature = true;
      guardToast(
        "info",
        "Project detected",
        `Workflow signature: ${detected.project_folder || detected.project_id}`
      );
    } else {
      const folder = inferProjectFolderFromGraph(isSaveLikeNode) || outputMeta?.projectFolder || "";
      if (folder) {
        detected.mode = "path";
        detected.project_folder = folder;
        detected.confidence = 60;
        guardToast("info", "Project inferred", `From save paths: ${folder}`);
      } else {
        guardToast("warn", "No project detected", "This workflow has no PROJECTS paths or signature.");
      }
      guardToast("warn", "Workflow unassigned", "Assign or create a project for this workflow.");
    }
  }

  if (!workflowHasSignature) {
    if (detected.project_folder) {
      pendingProjectName = detected.project_folder;
    }
    pendingSelectProjectId = "";
  }

  if (!detected.project_id && detected.project_folder) {
    detected.project_id = await tryResolveProjectId(detected.project_folder);
    if (isStale()) return;
  }

  const activeId = state.projectId || "";
  const detectedId = detected.project_id || "";
  const hasActive = !!activeId;
  const conflict = hasActive && detectedId && activeId !== detectedId;

  const shouldAutoSwitch =
    (detected.mode === "signature" || detected.mode === "path") &&
    detectedId &&
    state.autoSwitchTrusted &&
    (!hasActive || conflict);

  if (shouldAutoSwitch) {
    if (isStale()) return;
    try {
      if (outputMeta) {
        if (outputMeta.name) state.name = outputMeta.name;
        if (outputMeta.kind) state.kind = outputMeta.kind;
        if (outputMeta.media) state.media = outputMeta.media;
        if (outputMeta.relDir) state.lastRelDir = outputMeta.relDir;
        if (outputMeta.prefix) state.lastPrefix = outputMeta.prefix;
      }
      const entry = await setActiveProjectById(state, detectedId, runToken);
      if (isStale() || !entry) return;
      detected = { mode: "none", project_folder: "", project_id: "", confidence: 0 };
    } catch (e: unknown) {
      if (isStale()) return;
      lastError = e instanceof Error ? e.message : String(e);
      guardToast("error", "Auto-switch failed", lastError);
    }
  } else if (conflict) {
    guardToast(
      "warn",
      "Project mismatch",
      `Workflow: ${detected.project_folder || detected.project_id}`
    );
  }

  // Synchronize output metadata if we are on the active project and there is no unresolved conflict
  if (outputMeta && (!hasActive || !conflict || shouldAutoSwitch)) {
    if (outputMeta.name) state.name = outputMeta.name;
    if (outputMeta.kind) state.kind = outputMeta.kind;
    if (outputMeta.media) state.media = outputMeta.media;
    if (outputMeta.relDir) state.lastRelDir = outputMeta.relDir;
    if (outputMeta.prefix) state.lastPrefix = outputMeta.prefix;
  }

  if (!graphEmpty) {
    const modelTag = detectModelFromGraph(token3Tag) || "";
    if (modelTag !== state.detectedModelTag) {
      detectedModelTag = modelTag;
      if (modelTag) {
        guardToast("info", "Model detected", modelTag);
      }
    }
  }

  // Final staleness check before committing state mutations
  if (isStale()) return;

  // Atomic state update - all mutations happen together
  state.workflowHasSignature = workflowHasSignature;
  state.workflowChecked = workflowChecked;
  state.pendingProjectName = pendingProjectName;
  state.pendingSelectProjectId = pendingSelectProjectId;
  state.detected = detected;
  state.workflowPanelOpen = graphEmpty ? false : !workflowHasSignature;
  handleGraphEmptyTransition(state, runToken, graphEmpty);
  state.detectedModelTag = detectedModelTag;
  if (lastError) {
    state.lastError = lastError;
  }

  saveState(state);
  updateUI(state);
}

async function saveWorkflowToProject(state: RuntimeState, nameOverride?: string) {
  if (!state?.projectId) {
    toast("error", "No active project", "Set a project before saving workflows.");
    return;
  }

  // Get workflow BEFORE stamping signature to avoid partial state
  const workflow = getSerializedWorkflow();
  if (!workflow) {
    toast("error", "Workflow not available", "Could not serialize the current graph.");
    return;
  }

  let workflowName = (nameOverride ?? state.workflowName ?? "").trim();
  if (!workflowName) {
    const suggestion = state?._ui?.buildWorkflowName?.() ?? "";
    const entered = await psPrompt({
      title: "Workflow name",
      message: "Enter a workflow name base",
      defaultValue: suggestion,
    });
    if (entered === null) {
      toast("info", "Workflow save cancelled", "No name provided.");
      return;
    }
    workflowName = String(entered || "").trim();
    if (!workflowName) {
      toast("error", "Validation", "Workflow name is required.");
      return;
    }
    state?._ui?.setWorkflowName?.(workflowName);
  }

  const assetFolder = (state.workflowAsset || "").trim();

  try {
    // Stamp signature before save attempt
    stampGraphProjectSignature(app, state);

    const resp = await saveWorkflow({
      project_id: state.projectId,
      workflow_name: workflowName,
      workflow,
      overwrite: false,
      mirror_to_comfy_workflows: true,
      use_project_subfolder_in_workflows: true,
      asset_folder: assetFolder,
    });

    // Only update state after successful save
    state.workflowHasSignature = true;
    state.workflowChecked = true;
    state.lastError = "";

    const fileLabel = resp.file || "workflow.json";
    const projectInfo = resp.project_rel_path || "PROJECTS/<PROJECT>/03_WORKFLOWS";
    toast("success", "Workflow saved", `${fileLabel} -> ${projectInfo}`);

    const fileBase = String(resp.file || "").replace(/\.json$/i, "");
    const suffixMatch = fileBase.match(/_(\d{4})$/);
    if (suffixMatch) {
      const base = fileBase.slice(0, -5);
      state.workflowLastBase = base;
      state.workflowNextSuffix = Number(suffixMatch[1]) + 1;
      state?._ui?.setWorkflowName?.(base);
    }

    saveState(state);
    updateUI(state);

    if (!resp.mirrored) {
      const reason = resp.mirror_error || "Mirror disabled or unavailable.";
      toast("warn", "Workflow mirror", reason);
    }
  } catch (e: unknown) {
    state.lastError = e instanceof Error ? e.message : String(e);
    // Note: Signature was stamped, but save failed
    // User can try again with stamped signature
    updateUI(state);
    toast("error", "Workflow save failed", state.lastError);
  }
}

function saveActiveWorkflowToProjectCommand() {
  const state = runtimeState;
  if (!state) {
    toast("warn", "Project Settings", "Project Settings is not initialized.");
    return;
  }
  void saveWorkflowToProject(state);
}

function openProjectSettingsCommand() {
  const sidebar = app?.extensionManager?.sidebar;
  if (sidebar && typeof sidebar.setTab === "function") {
    sidebar.setTab("mjr_project_settings");
    return;
  }
  const state = runtimeState;
  if (state) {
    state.workflowPanelOpen = true;
    saveState(state);
    updateUI(state);
  }
}

function assignActiveProjectCommand() {
  const state = runtimeState;
  if (!state?.projectId || !state.projectFolder) {
    toast("error", "No active project", "Set a project first.");
    return;
  }
  stampGraphProjectSignature(app, state);
  state.workflowHasSignature = true;
  state.workflowChecked = true;
  state.detected = null;
  state.lastError = "";
  saveState(state);
  updateUI(state);
  toast("success", "Workflow assigned", state.projectFolder);
}

function scanMissingModelsCommand() {
  const state = runtimeState;
  if (!state) return;
  try {
    const { missing } = scanMissingModelsWithStats();
    state._ui?.refreshMissingStatus?.();
    toast(
      missing?.length ? "warn" : "success",
      "Missing Models",
      `${missing?.length || 0} missing model${missing?.length === 1 ? "" : "s"} detected`,
      { life: 4000 }
    );
  } catch (error) {
    console.error("[mjr] Error scanning missing models:", error);
    toast("error", "Missing Models", "Scan failed.");
  }
}

async function patchSaveNodesCommand() {
  const state = runtimeState;
  if (!state?.projectId) {
    toast("warn", "Patch skipped", "Set a project first.");
    return;
  }
  _rollOutputDateIfNeeded(state);
  let relDir = state.lastRelDir;
  const prefix = state.lastPrefix || "";
  if (!relDir && state.projectFolder) {
    relDir = joinRel(`PROJECTS/${state.projectFolder}`, mediaDir(state.media || "images"));
  }
  if (!relDir) {
    toast("warn", "Patch skipped", "Create an output target first.");
    return;
  }
  const preview = previewPatchSaveNodes(app, relDir, prefix, state.media);
  const nodeCount = new Set(preview.map((item) => item.node)).size;
  if (nodeCount === 0) {
    toast("warn", "No nodes patched", "No save-like nodes were found.");
    return;
  }
  const previewLines = preview
    .slice(0, 8)
    .map((item) => `${item.nodeLabel}.${item.widget}: ${item.oldValue || "-"} -> ${item.newValue || "-"}`);
  const overflow = preview.length > previewLines.length ? `\n...and ${preview.length - previewLines.length} more change(s)` : "";
  const confirmed = await psConfirm({
    title: "Patch save paths?",
    message:
      `Update ${nodeCount} save node${nodeCount === 1 ? "" : "s"} to use the project path?\n\n` +
      `${previewLines.join("\n")}${overflow}\n\n` +
      "This can be undone with Ctrl+Z.",
  });
  if (!confirmed) {
    toast("info", "Patch cancelled", "No nodes were modified.");
    return;
  }
  const patched = await patchSaveNodes(app, relDir, prefix, state.media);
  toast(
    patched ? "success" : "warn",
    patched ? "Patch applied" : "No nodes patched",
    patched ? `Updated ${patched} node${patched === 1 ? "" : "s"}.` : "No save-like nodes were updated."
  );
}

function registerWorkflowShortcut() {
  if (workflowShortcutRegistered) return;
  if (!getSettingBool(LEGACY_CTRL_S_HOOK_SETTING, DEFAULT_LEGACY_CTRL_S_HOOK)) return;
  workflowShortcutRegistered = true;
  window.addEventListener(
    "keydown",
    (event) => {
      const key = String(event.key || "").toLowerCase();
      if (!event.ctrlKey && !event.metaKey) return;
      if (key !== "s") return;
      const state = runtimeState;
      if (!state || state.autoHookSave === false) return;
      if (!state.projectId) return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void saveWorkflowToProject(state);
    },
    true
  );
}

const EXTENSION_SETTINGS: SettingDefinition[] = [
  // Notifications
  {
    id: TOAST_VERBOSE_SETTING,
    name: "Verbose toast notifications",
    type: "boolean",
    defaultValue: DEFAULT_TOAST_VERBOSE,
    tooltip: "When disabled, non-critical informational toasts are silenced to reduce screen clutter.",
    category: CATEGORY_NOTIFICATIONS,
    onChange: (value: boolean) => {
      try {
        localStorage.setItem("mjr_project_toast_verbose", value ? "true" : "false");
      } catch (_) {}
    },
  },

  // Projects & Workflows
  {
    id: AUTO_PATCH_NEW_NODES_SETTING,
    name: "Auto-patch newly added save nodes",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_PATCH_NEW_NODES,
    tooltip: "Automatically set the project output directory and prefix whenever new save-like nodes are added to the graph.",
    category: CATEGORY_PROJECTS,
    onChange: (value: boolean) => {
      const state = runtimeState;
      if (state) {
        state.autoPatchNewNodes = value;
        saveState(state);
        updateUI(state);
      }
    },
  },
  {
    id: AUTO_SWITCH_TRUSTED_SETTING,
    name: "Auto-switch to signed project",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_SWITCH_TRUSTED,
    tooltip: "Automatically switch the active project when opening a workflow that carries a Majoor project signature.",
    category: CATEGORY_PROJECTS,
    onChange: (value: boolean) => {
      const state = runtimeState;
      if (state) {
        state.autoSwitchTrusted = value;
        saveState(state);
        updateUI(state);
      }
    },
  },
  {
    id: AUTO_PATCH_SETTING,
    name: "Auto-patch on output create",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_PATCH,
    tooltip: "Automatically patch existing save nodes when a new output target directory is created.",
    category: CATEGORY_PROJECTS,
    onChange: (value: boolean) => {
      const state = runtimeState;
      if (state) {
        state.autoPatch = value;
        saveState(state);
        updateUI(state);
      }
    },
  },
  {
    id: AUTO_HOOK_SAVE_SETTING,
    name: "Auto-hook Ctrl+S to project save",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_HOOK_SAVE,
    tooltip: "Intercept Ctrl+S / Cmd+S to auto-save workflow into active project's 03_WORKFLOWS folder.",
    category: CATEGORY_PROJECTS,
    onChange: (value: boolean) => {
      const state = runtimeState;
      if (state) {
        state.autoHookSave = value;
        saveState(state);
        updateUI(state);
      }
    },
  },
  {
    id: PROMPT_EMPTY_GRAPH_SETTING,
    name: "Prompt on empty workflow",
    type: "boolean",
    defaultValue: DEFAULT_PROMPT_EMPTY_GRAPH,
    tooltip: "Prompt user to select or create a project when an empty workflow is loaded.",
    category: CATEGORY_PROJECTS,
  },
  {
    id: NO_PROJECT_STATUS_BLACK_SETTING,
    name: "Black status when no project",
    type: "boolean",
    defaultValue: DEFAULT_NO_PROJECT_STATUS_BLACK,
    tooltip: "Render topbar status badge in black when no project is currently active.",
    category: CATEGORY_PROJECTS,
    onChange: () => {
      const state = runtimeState;
      if (state) {
        updateMenuStatusBadge(state);
      }
    },
  },
  {
    id: LEGACY_CTRL_S_HOOK_SETTING,
    name: "Legacy Ctrl+S hook",
    type: "boolean",
    defaultValue: DEFAULT_LEGACY_CTRL_S_HOOK,
    tooltip: "Use legacy global key listener instead of modern ComfyUI command system for Ctrl+S.",
    category: CATEGORY_PROJECTS,
  },

  // Models & Downloads
  {
    id: AUTO_SCAN_MISSING_ON_OPEN_SETTING,
    name: "Auto-scan missing on panel open",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_SCAN_MISSING_ON_OPEN,
    tooltip: "Automatically scan the workflow for missing models whenever the Majoor sidebar panel is opened.",
    category: CATEGORY_MODELS,
  },
  {
    id: AUTO_OPEN_PANEL_ON_MISSING_SETTING,
    name: "Auto-open panel on missing models",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_OPEN_PANEL,
    tooltip: "Automatically open the Majoor sidebar panel if missing models are detected when loading a workflow.",
    category: CATEGORY_MODELS,
  },
  {
    id: AUTO_FIX_AFTER_DOWNLOAD_SETTING,
    name: "Auto-run Fix after download",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_FIX_AFTER_DOWNLOAD,
    tooltip: "Automatically prompt or execute Fix Missing Models on graph widgets after download completes.",
    category: CATEGORY_MODELS,
  },
  {
    id: AUTO_REMEMBER_NOTE_SOURCES_SETTING,
    name: "Auto-remember note sources",
    type: "boolean",
    defaultValue: DEFAULT_AUTO_REMEMBER_NOTE_SOURCES,
    tooltip: "Automatically store model URLs discovered in workflow markdown/note nodes for future use.",
    category: CATEGORY_MODELS,
  },
  {
    id: DOWNLOAD_MAX_GB_SETTING,
    name: "Download max size (GB)",
    type: "number",
    defaultValue: DEFAULT_DOWNLOAD_MAX_GB,
    min: 1,
    max: 1024,
    step: 1,
    tooltip: "Maximum model download size in Gigabytes before rejecting as too large.",
    category: CATEGORY_MODELS,
  },
];

function registerLegacyExtensionSettings() {
  const settings = app?.ui?.settings;
  if (!settings?.addSetting) return;
  try {
    const values = settings.settingsValues || {};
    for (const setting of EXTENSION_SETTINGS) {
      const fallback =
        setting.type === "number"
          ? toNumber(values[setting.id], setting.defaultValue)
          : toBool(values[setting.id], setting.defaultValue);
      settings.addSetting({ ...setting, defaultValue: fallback });
    }
  } catch (e) {
    console.warn("[mjr] settings registration failed", e);
  }
}

app.registerExtension({
  name: "Majoor.ProjectSettings",
  settings: EXTENSION_SETTINGS,
  commands: [
    {
      id: COMMAND_SAVE_WORKFLOW_TO_PROJECT,
      label: "MajoorPS: Save workflow to project",
      function: saveActiveWorkflowToProjectCommand,
    },
    {
      id: COMMAND_OPEN_PANEL,
      label: "MajoorPS: Open Project Settings",
      function: openProjectSettingsCommand,
    },
    {
      id: COMMAND_ASSIGN_ACTIVE_PROJECT,
      label: "MajoorPS: Assign workflow to active project",
      function: assignActiveProjectCommand,
    },
    {
      id: COMMAND_SCAN_MISSING_MODELS,
      label: "MajoorPS: Scan missing models",
      function: scanMissingModelsCommand,
    },
    {
      id: COMMAND_PATCH_SAVE_NODES,
      label: "MajoorPS: Patch save nodes now",
      function: patchSaveNodesCommand,
    },
  ],
  menuCommands: [
    {
      path: ["Extensions", "Majoor Project Settings"],
      commands: [
        COMMAND_OPEN_PANEL,
        COMMAND_ASSIGN_ACTIVE_PROJECT,
        COMMAND_SAVE_WORKFLOW_TO_PROJECT,
        COMMAND_SCAN_MISSING_MODELS,
        COMMAND_PATCH_SAVE_NODES,
      ],
    },
  ],

  async setup() {
    await loadConfig();
    registerLegacyExtensionSettings();
    const canSidebar = !!app?.extensionManager?.registerSidebarTab;
    const state = createRuntimeState(loadState() || {});

    if (!state.kind) state.kind = "asset";
    if (state.media === "asset") {
      state.kind = "asset";
      state.media = "images";
    }
    if (state.media === "shot") {
      state.kind = "shot";
      state.media = "videos";
    }
    if (state.customModel && !state.customModelText) {
      state.customModelText = state.customModel;
    }
    if (state.modelSelection === "__custom__") {
      state.modelSelection = "";
    }
    if (state.pathTemplate === "{BASE}/{MEDIA}/{DATE}/{MODEL}/{NAME}") {
      state.pathTemplate = "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";
    }
    if (state.useCustomModel == null) {
      state.useCustomModel = false;
    }
    if (state.autoHookSave == null) {
      state.autoHookSave = true;
    }
    if (!state.workflowLastBase) {
      state.workflowLastBase = "";
    }
    const nextSuffix = Number(state.workflowNextSuffix);
    if (!nextSuffix || nextSuffix < 1) {
      state.workflowNextSuffix = 1;
    } else {
      state.workflowNextSuffix = Math.floor(nextSuffix);
    }
    if (state.modelUpper == null) {
      state.modelUpper = state.useCustomModel === true;
    }
    if (!state.detectedModelTag) {
      state.detectedModelTag = "";
    }
    if (!Number.isFinite(state.graphLoadToken)) {
      state.graphLoadToken = 0;
    }
    state.autoPatchNewNodes = getSettingBool(AUTO_PATCH_NEW_NODES_SETTING, state.autoPatchNewNodes !== false);
    state.autoSwitchTrusted = getSettingBool(AUTO_SWITCH_TRUSTED_SETTING, state.autoSwitchTrusted !== false);
    state.autoHookSave = getSettingBool(AUTO_HOOK_SAVE_SETTING, state.autoHookSave !== false);
    state.autoPatch = getSettingBool(AUTO_PATCH_SETTING, state.autoPatch !== false);
    setRuntimeState(state);
    _rollOutputDateIfNeeded(state);
    updateMenuStatusBadge(state);
    registerWorkflowShortcut();
    state._emptyGraphPromptToken = null;
    attachGraphEventListeners(state);

    const renderPanel = (el: HTMLElement) => {
      const options: SidebarRenderOptions = {
        createAndActivateProject,
        setActiveProjectById,
        saveWorkflowToProject,
      };
      return buildPanel(el, state, options);
    };

    if (canSidebar) {
      app.extensionManager.registerSidebarTab({
        id: "mjr_project_settings",
        icon: "pi pi-briefcase",
        title: "Project",
        tooltip: "Majoor Project Settings",
        type: "custom",
        render: (el: HTMLElement) => renderPanel(el),
      });
    } else {
      const box = document.createElement("div");
      box.style.position = "fixed";
      box.style.top = "64px";
      box.style.right = "16px";
      box.style.zIndex = "9999";
      box.style.background = "rgba(20,20,20,0.9)";
      box.style.border = "1px solid rgba(255,255,255,0.1)";
      box.style.padding = "10px";
      box.style.borderRadius = "10px";
      box.style.width = "280px";
      document.body.appendChild(box);
      renderPanel(box);
    }
  },

  async beforeConfigureGraph() {
    if (runtimeState) {
      runtimeState.isGraphLoading = true;
      runtimeState.graphLoadToken = (runtimeState.graphLoadToken || 0) + 1;
    }
  },

  async afterConfigureGraph() {
    if (runtimeState) {
      runtimeState.isGraphLoading = false;
      attachGraphEventListeners(runtimeState);
      onGraphLoadedDetectProject(runtimeState, runtimeState.graphLoadToken);
      _rollOutputDateIfNeeded(runtimeState);

      // Automatically scan for missing models when workflow loads (deferred to avoid blocking graph configure)
      if (getSettingBool(AUTO_SCAN_MISSING_ON_OPEN_SETTING, DEFAULT_AUTO_SCAN_MISSING_ON_OPEN)) {
        const scanToken = runtimeState.graphLoadToken;
        setTimeout(() => {
          if (!runtimeState || runtimeState.graphLoadToken !== scanToken) return;
          try {
            const { missing } = scanMissingModelsWithStats();

            if (runtimeState?._ui?.refreshMissingStatus) {
              runtimeState._ui.refreshMissingStatus();
            }

            if (missing && missing.length > 0) {
              toast(
                "warn",
                "Missing Models",
                `${missing.length} missing model${missing.length !== 1 ? "s" : ""} detected in workflow`,
                { life: 4000 }
              );

              if (getSettingBool(AUTO_OPEN_PANEL_ON_MISSING_SETTING, DEFAULT_AUTO_OPEN_PANEL)) {
                const sidebar = app?.extensionManager?.sidebar;
                if (sidebar && typeof sidebar.setTab === "function") {
                  setTimeout(() => {
                    sidebar.setTab("mjr_project_settings");
                  }, 100);
                }
              }
            }
          } catch (error) {
            console.error("[mjr] Error scanning missing models on workflow load:", error);
          }
        }, 0);
      }
    }
  },

  async beforeQueuePrompt() {
    if (runtimeState) {
      const activeId = runtimeState.projectId;
      const detectedId = runtimeState.detected?.project_id;
      const activeFolder = runtimeState.projectFolder;
      const detectedFolder = runtimeState.detected?.project_folder;

      const hasConflict =
        (detectedId && activeId && detectedId !== activeId) ||
        (detectedFolder && activeFolder && detectedFolder.toLowerCase() !== activeFolder.toLowerCase());

      if (hasConflict) {
        const msg = `Workflow belongs to project '${detectedFolder || detectedId}', but active project is '${activeFolder || activeId}'.`;
        toast("error", "Project Conflict", `${msg} Execution blocked to protect output paths. Switch project first.`, { life: 6000 });
        throw new Error(`[Majoor] Execution blocked: ${msg}`);
      }

      // Roll date if needed before execution
      _rollOutputDateIfNeeded(runtimeState);

      // Auto-patch output nodes with current date before execution
      if (runtimeState.projectId && (runtimeState.lastRelDir || runtimeState.lastPrefix)) {
        try {
          const relDir = runtimeState.lastRelDir || "";
          const prefix = runtimeState.lastPrefix || "";
          const patched = await patchSaveNodes(app, relDir, prefix);
          if (patched > 0) {
            console.log(`[mjr] Auto-patched ${patched} save node(s) before execution`);
          }
        } catch (err) {
          console.error("[mjr] Failed to auto-patch nodes before execution:", err);
        }
      }

      stampGraphProjectSignature(app, runtimeState);
    }
  },

  async nodeCreated(node: ComfyNode) {
    const state = runtimeState;
    if (!state || state.isGraphLoading) return;
    if (state.graphIsEmpty) {
      if (handleGraphEmptyTransition(state, state.graphLoadToken, false)) {
        saveState(state);
        updateUI(state);
      }
    }
    await loadConfig();
    if (!state.projectId || !state.autoPatchNewNodes) return;
    if (!state.projectFolder || state.projectExists === false) return;

    if (!isSaveLikeNode(node)) return;

    let warnedPathed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const attemptPatch = (retriesLeft: number): void => {
      // Check if node was removed from graph
      const nodeStillExists = app.graph?._nodes?.includes(node);
      if (!nodeStillExists) {
        // Clean up timeout if node was removed
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        return;
      }

      if (!state.projectId || !state.autoPatchNewNodes) return;
      if (!state.projectFolder || state.projectExists === false) return;
      if (state.isGraphLoading) return;

      const widgets = node?.widgets || [];
      const filenameWidget = widgets.find((w) => w?.name === "filename_prefix");
      const pathWidget = widgets.find((w) => w?.name && PATH_WIDGETS.includes(w.name));
      if (!filenameWidget && !pathWidget) {
        if (retriesLeft > 0) {
          timeoutId = setTimeout(() => attemptPatch(retriesLeft - 1), NODE_PATCH_RETRY_DELAY_MS);
        }
        return;
      }

      if (filenameWidget && alreadyProjectPathed(filenameWidget.value)) {
        if (!warnedPathed) {
          warnedPathed = true;
          toast("warn", "Patch skipped", "Node already points to a project path.");
        }
        return;
      }
      if (pathWidget && alreadyProjectPathed(pathWidget.value)) {
        if (!warnedPathed) {
          warnedPathed = true;
          toast("warn", "Patch skipped", "Node already points to a project path.");
        }
        return;
      }

      const nm = detectNodeMedia(node) || "images";
      _rollOutputDateIfNeeded(state);
      let relDir = state.lastRelDir;
      let prefix = state.lastPrefix || "";
      if (!relDir) {
        const base = `PROJECTS/${state.projectFolder}`;
        relDir = joinRel(base, mediaDir(nm));
      }
      if (patchSingleNode(node, relDir, prefix)) {
        try {
          app.graph.setDirtyCanvas(true, true);
        } catch (_) {}
        toast("success", "Auto-patch", "New save node patched.", { life: 2000 });
      } else if (retriesLeft > 0) {
        timeoutId = setTimeout(() => attemptPatch(retriesLeft - 1), NODE_PATCH_RETRY_DELAY_MS);
      }
    };

    attemptPatch(NODE_PATCH_MAX_RETRIES);
  },
});
