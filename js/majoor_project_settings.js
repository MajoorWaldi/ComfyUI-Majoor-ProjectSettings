/**
 * Majoor Project Settings (standalone)
 * - Sidebar UI when available (fallback floating panel)
 * - No nodes, no polling
 */

import { app } from "../../scripts/app.js";
import { joinRel, mediaDir, token3Tag } from "./mjr/utils.js";
import { toast } from "./mjr/toast.js";
import { fetchJSON, saveWorkflow, tryResolveProjectId } from "./mjr/api.js";
import { psConfirm, psPrompt } from "./mjr/dialog.js";
import {
  detectModelFromGraph,
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
  patchSingleNode,
  stampGraphProjectSignature,
} from "./mjr/patch.js";
import { buildPanel } from "./ui_components.js";
import {
  createRuntimeState,
  loadState,
  saveState,
  runtimeState,
  setRuntimeState,
} from "./state_manager.js";
import { scanMissingModelsWithStats } from "./mjr/model_fixer.js";

let workflowShortcutRegistered = false;

const NODE_PATCH_RETRY_DELAY_MS = 60;
const NODE_PATCH_MAX_RETRIES = 1;
const SETTINGS_CATEGORY = "MajoorPS";
const DOWNLOAD_MAX_GB_SETTING = "mjr_project.download_max_gb";
const DEFAULT_DOWNLOAD_MAX_GB = 50;
const AUTO_FIX_AFTER_DOWNLOAD_SETTING = "mjr_project.auto_fix_after_download";
const AUTO_OPEN_PANEL_ON_MISSING_SETTING = "mjr_project.auto_open_panel_on_missing";
const AUTO_SCAN_MISSING_ON_OPEN_SETTING = "mjr_project.auto_scan_missing_on_open";
const AUTO_REMEMBER_NOTE_SOURCES_SETTING = "mjr_project.auto_remember_note_sources";
const NO_PROJECT_STATUS_BLACK_SETTING = "mjr_project.status_black_no_project";
const DEFAULT_AUTO_FIX_AFTER_DOWNLOAD = true;
const DEFAULT_AUTO_OPEN_PANEL = true;
const DEFAULT_AUTO_SCAN_MISSING_ON_OPEN = true;
const DEFAULT_AUTO_REMEMBER_NOTE_SOURCES = true;
const DEFAULT_NO_PROJECT_STATUS_BLACK = false;
const GRAPH_EMPTY_POLL_INTERVAL_MS = 900;
let graphEmptyWatcherId = null;

const toNumber = (value, fallback) => {
  if (value == null) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toBool = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off"].includes(v)) return false;
  }
  return fallback;
};

const getSettingBool = (id, fallback) => {
  const raw = app?.ui?.settings?.settingsValues?.[id];
  return toBool(raw, fallback);
};

function updateUI(state) {
  const safe = (fn, label) => {
    try {
      const result = fn?.();
      if (result && typeof result.then === "function") {
        result.catch((err) => {
          console.error(`[mjr] UI update failed: ${label}`, err);
          if (label === "status") {
            toast("error", "UI Error", `Failed to update ${label}`, { life: 3000 });
          }
        });
      }
    } catch (err) {
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
  safe(state?._ui?.refreshExistingNames, "existing names");
  safe(state?._ui?.refreshMissingStatus, "missing models");
  safe(state?._ui?.updatePreview, "preview");
}

async function setActiveProjectById(state, projectId, token) {
  const resp = await fetchJSON("/mjr_project/list");
  const list = resp.projects || [];
  const entry = list.find((p) => p.project_id === projectId);
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
  saveState(state);
  updateUI(state);
  state?._ui?.resetForProjectChange?.();
  toast("success", "Project active", entry.folder || entry.project_id);
  return entry;
}

/**
 * Shared function to create and activate a project.
 * Eliminates code duplication across multiple create buttons.
 */
async function createAndActivateProject(state, projectName, updateCallbacks) {
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
  toast("success", "Project created", resp.project_folder);

  return resp;
}

const buildUpdateCallbacks = (state) => {
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

async function promptEmptyGraphProject(state, runToken) {
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

function handleGraphEmptyTransition(state, runToken, currentEmpty) {
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
  } else {
    void promptEmptyGraphProject(state, runToken ?? state.graphLoadToken);
  }
  return true;
}

function startGraphEmptyWatcher(state) {
  if (!state) return;
  if (graphEmptyWatcherId) {
    clearInterval(graphEmptyWatcherId);
    graphEmptyWatcherId = null;
  }
  graphEmptyWatcherId = setInterval(() => {
    if (!state) return;
    const empty = isGraphCurrentlyEmpty();
    if (handleGraphEmptyTransition(state, state.graphLoadToken, empty)) {
      saveState(state);
      updateUI(state);
    }
  }, GRAPH_EMPTY_POLL_INTERVAL_MS);
}

async function onGraphLoadedDetectProject(state, token) {
  if (!state) return;
  await loadConfig();
  const runToken = typeof token === "number" ? token : state.graphLoadToken || 0;
  const isStale = () => state.graphLoadToken !== runToken;
  const graphNodes = app?.graph?._nodes;
  const graphEmpty = !Array.isArray(graphNodes) || graphNodes.length === 0;
  const guardToast = (type, title, message, opts) => {
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
      const folder = inferProjectFolderFromGraph(isSaveLikeNode);
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

  if (
    detected.mode === "signature" &&
    detectedId &&
    state.autoSwitchTrusted &&
    (!hasActive || conflict)
  ) {
    if (isStale()) return;
    try {
      const entry = await setActiveProjectById(state, detectedId, runToken);
      if (isStale() || !entry) return;
      detected = { mode: "none", project_folder: "", project_id: "", confidence: 0 };
    } catch (e) {
      if (isStale()) return;
      lastError = String(e.message || e);
      guardToast("error", "Auto-switch failed", lastError);
    }
  } else if (conflict) {
    guardToast(
      "warn",
      "Project mismatch",
      `Workflow: ${detected.project_folder || detected.project_id}`
    );
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

async function saveWorkflowToProject(state, nameOverride) {
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
  } catch (e) {
    state.lastError = String(e.message || e);
    // Note: Signature was stamped, but save failed
    // User can try again with stamped signature
    updateUI(state);
    toast("error", "Workflow save failed", state.lastError);
  }
}

function registerWorkflowShortcut() {
  if (workflowShortcutRegistered) return;
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
      saveWorkflowToProject(state);
    },
    true
  );
}

function registerExtensionSettings() {
  const settings = app?.ui?.settings;
  if (!settings?.addSetting) return;
  try {
    const values = settings.settingsValues || {};
    settings.addSetting({
      id: DOWNLOAD_MAX_GB_SETTING,
      name: "MajoorPS: Download max size (GB)",
      type: "number",
      defaultValue: toNumber(values[DOWNLOAD_MAX_GB_SETTING], DEFAULT_DOWNLOAD_MAX_GB),
      min: 1,
      max: 1024,
      step: 1,
      category: SETTINGS_CATEGORY,
    });
    settings.addSetting({
      id: AUTO_FIX_AFTER_DOWNLOAD_SETTING,
      name: "MajoorPS: Auto-run Fix after download",
      type: "boolean",
      defaultValue: toBool(values[AUTO_FIX_AFTER_DOWNLOAD_SETTING], DEFAULT_AUTO_FIX_AFTER_DOWNLOAD),
      category: SETTINGS_CATEGORY,
    });
    settings.addSetting({
      id: AUTO_OPEN_PANEL_ON_MISSING_SETTING,
      name: "MajoorPS: Auto-open panel on missing models",
      type: "boolean",
      defaultValue: toBool(values[AUTO_OPEN_PANEL_ON_MISSING_SETTING], DEFAULT_AUTO_OPEN_PANEL),
      category: SETTINGS_CATEGORY,
    });
    settings.addSetting({
      id: AUTO_SCAN_MISSING_ON_OPEN_SETTING,
      name: "MajoorPS: Auto-scan missing on panel open",
      type: "boolean",
      defaultValue: toBool(values[AUTO_SCAN_MISSING_ON_OPEN_SETTING], DEFAULT_AUTO_SCAN_MISSING_ON_OPEN),
      category: SETTINGS_CATEGORY,
    });
    settings.addSetting({
      id: AUTO_REMEMBER_NOTE_SOURCES_SETTING,
      name: "MajoorPS: Auto-remember note sources",
      type: "boolean",
      defaultValue: toBool(values[AUTO_REMEMBER_NOTE_SOURCES_SETTING], DEFAULT_AUTO_REMEMBER_NOTE_SOURCES),
      category: SETTINGS_CATEGORY,
    });
    settings.addSetting({
      id: NO_PROJECT_STATUS_BLACK_SETTING,
      name: "MajoorPS: Black status when no project",
      type: "boolean",
      defaultValue: toBool(values[NO_PROJECT_STATUS_BLACK_SETTING], DEFAULT_NO_PROJECT_STATUS_BLACK),
      category: SETTINGS_CATEGORY,
    });
  } catch (e) {
    console.warn("[mjr] settings registration failed", e);
  }
}

app.registerExtension({
  name: "Majoor.ProjectSettings",

  async setup() {
    await loadConfig();
    registerExtensionSettings();
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
    setRuntimeState(state);
    registerWorkflowShortcut();
    state._emptyGraphPromptToken = null;
    startGraphEmptyWatcher(state);

    const renderPanel = (el) =>
      buildPanel(el, state, {
        createAndActivateProject,
        setActiveProjectById,
        saveWorkflowToProject,
      });

    if (canSidebar) {
      app.extensionManager.registerSidebarTab({
        id: "mjr_project_settings",
        icon: "pi pi-briefcase",
        title: "Project",
        tooltip: "Majoor Project Settings",
        type: "custom",
        render: (el) => renderPanel(el),
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
      onGraphLoadedDetectProject(runtimeState, runtimeState.graphLoadToken);

      // Automatically scan for missing models when workflow loads
      try {
        const { missing, total } = scanMissingModelsWithStats();

        // Update missing status in UI
        if (runtimeState?._ui?.refreshMissingStatus) {
          runtimeState._ui.refreshMissingStatus();
        }

        // Show info toast if missing models detected
      if (missing && missing.length > 0) {
        toast("warn", "Missing Models", `${missing.length} missing model${missing.length !== 1 ? 's' : ''} detected in workflow`, { life: 4000 });

        if (getSettingBool(AUTO_OPEN_PANEL_ON_MISSING_SETTING, DEFAULT_AUTO_OPEN_PANEL)) {
          // Auto-open the sidebar panel if available
          const sidebar = app?.extensionManager?.sidebar;
          if (sidebar && typeof sidebar.setTab === "function") {
            // Small delay to ensure UI is ready
            setTimeout(() => {
              sidebar.setTab("mjr_project_settings");
            }, 100);
          }
        }
      }
    } catch (error) {
      console.error("[mjr] Error scanning missing models on workflow load:", error);
    }
    }
  },

  async beforeQueuePrompt() {
    if (runtimeState) {
      stampGraphProjectSignature(app, runtimeState);
    }
  },

  async nodeCreated(node) {
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
    let timeoutId = null;

    const attemptPatch = (retriesLeft) => {
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
