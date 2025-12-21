/**
 * Majoor Project Settings (standalone)
 * - Sidebar UI when available (fallback floating panel)
 * - No nodes, no polling
 */

import { app } from "../../scripts/app.js";
import {
  joinRel,
  makeKindToken,
  mediaDir,
  resolveTemplatePreview,
  titlePathJS,
  token3Tag,
  yymmddJS,
} from "./mjr/utils.js";
import { ensureStyles, toast } from "./mjr/toast.js";
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
  patchSaveNodes,
  patchSingleNode,
  stampGraphProjectSignature,
} from "./mjr/patch.js";

const STORAGE_KEY = "mjr_project_settings_state";
let runtimeState = null;
let workflowShortcutRegistered = false;

const TEMPLATE_TOKENS = ["{BASE}", "{MEDIA}", "{DATE}", "{MODEL}", "{NAME}", "{KIND}"];

function parseHexColor(hex) {
  const m = String(hex || "").trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const v = m[1];
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function colorWithAlpha(hex, alpha) {
  const rgb = parseHexColor(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function updateUI(state) {
  try {
    state?._ui?.updateStatus?.();
    state?._ui?.updateResolve?.();
    state?._ui?.updateWorkflowBlock?.();
    state?._ui?.updatePreview?.();
  } catch (_) {}
}

async function setActiveProjectById(state, projectId) {
  const resp = await fetchJSON("/mjr_project/list");
  const list = resp.projects || [];
  const entry = list.find((p) => p.project_id === projectId);
  if (!entry) {
    throw new Error("project not found");
  }
  state.projectId = entry.project_id;
  state.projectFolder = entry.folder || "";
  state.projectExists = entry.exists !== false;
  state.lastError = "";
  saveState(state);
  updateUI(state);
  state?._ui?.resetForProjectChange?.();
  toast("success", "Project active", entry.folder || entry.project_id);
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
  updatePreview();
  refreshProjectsList();
  stampGraphProjectSignature(app, state);
  toast("success", "Project created", resp.project_folder);

  return resp;
}

async function onGraphLoadedDetectProject(state) {
  if (!state) return;
  state.workflowHasSignature = false;
  state.workflowChecked = true;
  let detected = {
    mode: "none",
    project_folder: "",
    project_id: "",
    confidence: 0,
  };

  const sig = readGraphSignature();
  if (sig && (sig.project_id || sig.project_folder)) {
    detected.mode = "signature";
    detected.project_id = String(sig.project_id || "");
    detected.project_folder = String(sig.project_folder || "");
    detected.confidence = 100;
    state.workflowHasSignature = true;
    toast("info", "Project detected", `Workflow signature: ${detected.project_folder || detected.project_id}`);
  } else {
    const folder = inferProjectFolderFromGraph(isSaveLikeNode);
    if (folder) {
      detected.mode = "path";
      detected.project_folder = folder;
      detected.confidence = 60;
      toast("info", "Project inferred", `From save paths: ${folder}`);
    } else {
      toast("warn", "No project detected", "This workflow has no PROJECTS paths or signature.");
    }
    toast("warn", "Workflow unassigned", "Assign or create a project for this workflow.");
  }

  if (!state.workflowHasSignature) {
    state.pendingProjectName = detected.project_folder || "";
    state.pendingSelectProjectId = "";
  }

  if (!detected.project_id && detected.project_folder) {
    detected.project_id = await tryResolveProjectId(detected.project_folder);
  }

  const activeId = state.projectId || "";
  const detectedId = detected.project_id || "";
  const hasActive = !!activeId;
  const hasDetected = detected.mode !== "none";
  const conflict = hasActive && detectedId && activeId !== detectedId;

  if (
    detected.mode === "signature" &&
    detectedId &&
    state.autoSwitchTrusted &&
    (!hasActive || conflict)
  ) {
    try {
      await setActiveProjectById(state, detectedId);
      detected = { mode: "none", project_folder: "", project_id: "", confidence: 0 };
    } catch (e) {
      state.lastError = String(e.message || e);
      updateUI(state);
      toast("error", "Auto-switch failed", state.lastError);
    }
  } else if (conflict) {
    toast(
      "warn",
      "Project mismatch",
      `Workflow: ${detected.project_folder || detected.project_id}`
    );
  }

  state.detected = detected;
  state.workflowPanelOpen = !state.workflowHasSignature;
  const modelTag = detectModelFromGraph(token3Tag) || "";
  if (modelTag !== state.detectedModelTag) {
    state.detectedModelTag = modelTag;
    saveState(state);
    if (modelTag) {
      toast("info", "Model detected", modelTag);
    }
  }
  updateUI(state);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function saveState(state) {
  const data = {
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

function makeStatus(state) {
  const det = state.detected;
  const sameProject =
    det &&
    det.mode !== "none" &&
    ((det.project_id && det.project_id === state.projectId) ||
      (det.project_folder && det.project_folder === state.projectFolder));
  const mismatch =
    det &&
    det.mode !== "none" &&
    !sameProject &&
    (det.project_id || det.project_folder);

  if (state.lastError) {
    return { color: "#b33a3a", text: `Error: ${state.lastError}`, level: "red" };
  }
  if (!state.projectId) {
    return { color: "#666666", text: "No active project", level: "gray" };
  }
  if (state.projectExists === false) {
    return {
      color: "#b33a3a",
      text: `Missing project folder: ${state.projectFolder || state.projectId}`,
      level: "red",
    };
  }
  if (state.workflowChecked && !state.workflowHasSignature) {
    return {
      color: "#c77c2a",
      text: `Active project, workflow unassigned`,
      level: "orange",
    };
  }
  if (mismatch) {
    return {
      color: "#c77c2a",
      text: `Project mismatch: ${det.project_folder || det.project_id}`,
      level: "orange",
    };
  }
  return {
    color: "#2f8f4e",
    text: `Active: ${state.projectFolder} (${state.projectId})`,
    level: "green",
  };
}


async function saveWorkflowToProject(state, nameOverride) {
  if (!state?.projectId) {
    toast("error", "No active project", "Set a project before saving workflows.");
    return;
  }
  stampGraphProjectSignature(app, state);
  state.workflowHasSignature = true;
  state.workflowChecked = true;
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
    const resp = await saveWorkflow({
      project_id: state.projectId,
      workflow_name: workflowName,
      workflow,
      overwrite: false,
      mirror_to_comfy_workflows: true,
      use_project_subfolder_in_workflows: true,
      asset_folder: assetFolder,
    });
    state.lastError = "";
    updateUI(state);
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
    if (!resp.mirrored) {
      const reason = resp.mirror_error || "Mirror disabled or unavailable.";
      toast("warn", "Workflow mirror", reason);
    }
  } catch (e) {
    state.lastError = String(e.message || e);
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

function buildPanel(el, state) {
  el.innerHTML = "";
  ensureStyles();

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "10px";
  container.style.fontSize = "12px";
  container.style.color = "#ddd";
  container.style.fontFamily = "inherit";
  container.style.padding = "8px 14px 16px";

  const section = (label) => {
    const h = document.createElement("div");
    h.textContent = label;
    h.style.fontWeight = "600";
    h.style.marginTop = "8px";
    h.style.marginBottom = "4px";
    h.style.paddingLeft = "2px";
    h.style.textTransform = "uppercase";
    h.style.letterSpacing = "0.6px";
    h.style.color = "#8fb9ff";
    return h;
  };

  const divider = (thick = false) => {
    const d = document.createElement("div");
    d.style.height = thick ? "3px" : "1px";
    d.style.background = "rgba(255,255,255,0.08)";
    d.style.margin = "6px 0";
    return d;
  };

  const detailsSection = (title) => {
    const details = document.createElement("details");
    details.style.marginTop = "4px";
    const summary = document.createElement("summary");
    summary.textContent = title;
    summary.style.cursor = "pointer";
    summary.style.opacity = "0.9";
    summary.style.textTransform = "uppercase";
    summary.style.letterSpacing = "0.6px";
    summary.style.color = "#8fb9ff";
    summary.style.fontWeight = "600";
    summary.style.paddingLeft = "2px";
    details.appendChild(summary);
    details._summary = summary;
    return details;
  };

  const row = (labelText, inputEl) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "6px";

    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.opacity = "0.85";
    label.style.marginLeft = "2px";
    label.style.fontSize = "11px";
    label.style.lineHeight = "1.2";

    inputEl.style.width = "100%";
    inputEl.style.boxSizing = "border-box";
    inputEl.style.padding = "6px 8px";
    inputEl.style.borderRadius = "8px";
    inputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    inputEl.style.background = "rgba(0,0,0,0.25)";
    inputEl.style.color = "#eee";
    inputEl.style.outline = "none";

    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  };

  const btn = (text) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.className = "mjr-ps-btn";
    b.style.padding = "7px 8px";
    b.style.borderRadius = "8px";
    b.style.border = "1px solid rgba(46, 136, 255, 0.65)";
    b.style.background = "rgba(46, 136, 255, 0.25)";
    b.style.color = "#eee";
    b.style.cursor = "pointer";
    b.style.margin = "0";
    b.style.lineHeight = "1.2";
    b.style.whiteSpace = "nowrap";
    return b;
  };

  // Status bar
  const statusBar = document.createElement("div");
  statusBar.style.display = "flex";
  statusBar.style.alignItems = "center";
  statusBar.style.gap = "8px";
  statusBar.style.padding = "6px 8px";
  statusBar.style.borderRadius = "8px";
  statusBar.style.position = "sticky";
  statusBar.style.top = "0";
  statusBar.style.zIndex = "2";
  statusBar.style.background = "rgba(10, 12, 16, 0.72)";
  statusBar.style.backdropFilter = "blur(6px)";
  statusBar.style.cursor = "pointer";
  statusBar.title = "Toggle workflow project panel";
  const statusDot = document.createElement("div");
  statusDot.style.width = "8px";
  statusDot.style.height = "8px";
  statusDot.style.borderRadius = "50%";
  const statusText = document.createElement("div");
  statusText.style.opacity = "0.95";

  const updateStatus = () => {
    const s = makeStatus(state);
    const level = s.level || "gray";
    statusBar.style.background = colorWithAlpha(s.color, 0.92);
    statusBar.style.border = `1px solid ${colorWithAlpha(s.color, 0.35)}`;
    statusDot.style.background = s.color;
    statusText.textContent = s.text;
    if (workflowSaveWrap) {
      workflowSaveWrap.style.border = `1px solid ${colorWithAlpha(s.color, 0.4)}`;
      workflowSaveWrap.style.background = colorWithAlpha(s.color, 0.12);
    }
    if (workflowWrap) {
      const emphasize = level === "orange" && state.workflowChecked && !state.workflowHasSignature;
      workflowWrap.style.border = emphasize
        ? `1px solid ${colorWithAlpha("#c77c2a", 0.7)}`
        : "1px solid rgba(255,255,255,0.12)";
      workflowWrap.style.background = emphasize
        ? colorWithAlpha("#c77c2a", 0.1)
        : "rgba(15, 17, 22, 0.75)";
    }
  };
  statusBar.appendChild(statusDot);
  statusBar.appendChild(statusText);
  statusBar.addEventListener("click", () => {
    state.workflowPanelOpen = !state.workflowPanelOpen;
    saveState(state);
    updateWorkflowBlock();
  });

  const updateResolve = () => {
    const det = state.detected;
    if (!det) {
      resolveWrap.style.display = "none";
      return;
    }
    if (det.mode === "none") {
      resolveWrap.style.display = "none";
      return;
    }
    const sameProject =
      det.mode !== "none" &&
      ((det.project_id && det.project_id === state.projectId) ||
        (det.project_folder && det.project_folder === state.projectFolder));
    if (sameProject) {
      resolveWrap.style.display = "none";
      return;
    }
    const mode = det.mode || "none";
    const wfFolder = det.project_folder || "none";
    resolveInfo.textContent = `Workflow project: ${wfFolder} (mode: ${mode})`;
    resolveActive.textContent = `Active project: ${state.projectFolder || "none"}`;
    resolveWrap.style.display = "flex";

    const canSwitch = mode !== "none" && (det.project_id || det.project_folder);
    switchBtn.disabled = !canSwitch;
    switchBtn.style.opacity = canSwitch ? "1" : "0.5";

    const canAssign = !!state.projectId;
    assignBtn.disabled = !canAssign;
    assignBtn.style.opacity = canAssign ? "1" : "0.5";
  };

  const resolveWrap = document.createElement("div");
  resolveWrap.style.display = "none";
  resolveWrap.style.flexDirection = "column";
  resolveWrap.style.gap = "6px";
  resolveWrap.style.padding = "8px 10px";
  resolveWrap.style.borderRadius = "8px";
  resolveWrap.style.border = "1px solid rgba(255,255,255,0.12)";
  resolveWrap.style.background = "rgba(15, 17, 22, 0.75)";
  resolveWrap.style.backdropFilter = "blur(6px)";

  const resolveTitle = document.createElement("div");
  resolveTitle.textContent = "Workflow project";
  resolveTitle.style.textTransform = "uppercase";
  resolveTitle.style.letterSpacing = "0.6px";
  resolveTitle.style.fontWeight = "600";
  resolveTitle.style.color = "#8fb9ff";
  resolveTitle.style.marginBottom = "4px";

  const resolveInfo = document.createElement("div");
  resolveInfo.style.opacity = "0.9";

  const resolveActive = document.createElement("div");
  resolveActive.style.opacity = "0.85";

  const resolveBtns = document.createElement("div");
  resolveBtns.style.display = "flex";
  resolveBtns.style.gap = "8px";
  resolveBtns.style.flexWrap = "wrap";
  resolveBtns.style.justifyContent = "center";
  resolveBtns.style.alignItems = "center";
  resolveBtns.style.marginTop = "6px";

  const switchBtn = btn("Switch to detected project");
  const assignBtn = btn("Assign to active project");
  const createBtn = btn("Create new project");
  const dismissBtn = btn("Dismiss");
  for (const b of [switchBtn, assignBtn, createBtn, dismissBtn]) {
    b.style.fontSize = "11px";
    b.style.padding = "6px 8px";
    b.style.margin = "0";
  }
  resolveBtns.appendChild(switchBtn);
  resolveBtns.appendChild(assignBtn);
  resolveBtns.appendChild(createBtn);
  resolveBtns.appendChild(dismissBtn);

  resolveWrap.appendChild(resolveTitle);
  resolveWrap.appendChild(resolveInfo);
  resolveWrap.appendChild(resolveActive);
  resolveWrap.appendChild(resolveBtns);

  const workflowWrap = document.createElement("div");
  workflowWrap.style.display = "none";
  workflowWrap.style.flexDirection = "column";
  workflowWrap.style.gap = "6px";
  workflowWrap.style.padding = "8px 10px";
  workflowWrap.style.borderRadius = "8px";
  workflowWrap.style.border = "1px solid rgba(255,255,255,0.12)";
  workflowWrap.style.background = "rgba(15, 17, 22, 0.75)";
  workflowWrap.style.backdropFilter = "blur(6px)";

  const workflowTitle = document.createElement("div");
  workflowTitle.textContent = "Workflow Project";
  workflowTitle.style.textTransform = "uppercase";
  workflowTitle.style.letterSpacing = "0.6px";
  workflowTitle.style.fontWeight = "600";
  workflowTitle.style.color = "#8fb9ff";
  workflowTitle.style.marginBottom = "4px";

  const pendingProjectNameInput = document.createElement("input");
  pendingProjectNameInput.type = "text";
  pendingProjectNameInput.placeholder = "Project name";
  pendingProjectNameInput.value = state.pendingProjectName || "";

  const pendingSelect = document.createElement("select");
  pendingSelect.className = "mjr-ps-select";
  pendingSelect.style.width = "100%";
  pendingSelect.style.padding = "6px 8px";
  pendingSelect.style.borderRadius = "8px";
  pendingSelect.style.border = "1px solid rgba(255,255,255,0.12)";
  pendingSelect.style.color = "#f2f4f8";

  const wfCreateBtn = btn("Create & Activate");
  const wfActivateBtn = btn("Activate Selected");
  const wfAssignBtn = btn("Assign workflow to active");
  for (const b of [wfCreateBtn, wfActivateBtn, wfAssignBtn]) {
    b.style.fontSize = "11px";
    b.style.padding = "6px 8px";
    b.style.margin = "0";
  }

  const wfButtons = document.createElement("div");
  wfButtons.style.display = "flex";
  wfButtons.style.gap = "8px";
  wfButtons.style.flexWrap = "wrap";
  wfButtons.style.justifyContent = "center";
  wfButtons.style.alignItems = "center";
  wfButtons.style.marginTop = "6px";
  wfButtons.appendChild(wfCreateBtn);
  wfButtons.appendChild(wfActivateBtn);
  wfButtons.appendChild(wfAssignBtn);

  workflowWrap.appendChild(workflowTitle);
  workflowWrap.appendChild(row("Project name", pendingProjectNameInput));
  workflowWrap.appendChild(row("Or select existing project", pendingSelect));
  workflowWrap.appendChild(wfButtons);

  const updateWorkflowBlock = () => {
    const show = !!state.workflowPanelOpen;
    workflowWrap.style.display = show ? "flex" : "none";
    if (show) {
      pendingProjectNameInput.value = state.pendingProjectName || "";
      if (state.pendingSelectProjectId) {
        pendingSelect.value = state.pendingSelectProjectId;
      }
    }
  };

  const autoPatchNewWrap = document.createElement("label");
  autoPatchNewWrap.style.display = "flex";
  autoPatchNewWrap.style.alignItems = "center";
  autoPatchNewWrap.style.gap = "8px";
  autoPatchNewWrap.style.cursor = "pointer";
  const autoPatchNewCb = document.createElement("input");
  autoPatchNewCb.type = "checkbox";
  autoPatchNewCb.checked = state.autoPatchNewNodes !== false;
  const autoPatchNewText = document.createElement("span");
  autoPatchNewText.textContent = "Auto patch new nodes";
  autoPatchNewText.style.opacity = "0.9";
  autoPatchNewWrap.appendChild(autoPatchNewCb);
  autoPatchNewWrap.appendChild(autoPatchNewText);

  const autoSwitchWrap = document.createElement("label");
  autoSwitchWrap.style.display = "flex";
  autoSwitchWrap.style.alignItems = "center";
  autoSwitchWrap.style.gap = "8px";
  autoSwitchWrap.style.cursor = "pointer";
  const autoSwitchCb = document.createElement("input");
  autoSwitchCb.type = "checkbox";
  autoSwitchCb.checked = state.autoSwitchTrusted === true;
  const autoSwitchText = document.createElement("span");
  autoSwitchText.textContent = "Auto-switch trusted signature";
  autoSwitchText.style.opacity = "0.9";
  autoSwitchWrap.appendChild(autoSwitchCb);
  autoSwitchWrap.appendChild(autoSwitchText);

  // Model section (collapsible)
  const modelSection = detailsSection("Model");
  const modelSummary = modelSection._summary;

  const detectedModelLabel = document.createElement("div");
  detectedModelLabel.style.opacity = "0.9";
  detectedModelLabel.style.fontSize = "11px";
  detectedModelLabel.style.color = "#f2d98a";
  detectedModelLabel.style.textAlign = "center";
  detectedModelLabel.textContent = "Detected: -";

  const useCustomWrap = document.createElement("label");
  useCustomWrap.style.display = "flex";
  useCustomWrap.style.alignItems = "center";
  useCustomWrap.style.gap = "8px";
  useCustomWrap.style.cursor = "pointer";
  const useCustomCb = document.createElement("input");
  useCustomCb.type = "checkbox";
  useCustomCb.checked = state.useCustomModel === true;
  const useCustomText = document.createElement("span");
  useCustomText.textContent = "Use custom model (UPPERCASE)";
  useCustomText.style.opacity = "0.9";
  useCustomWrap.appendChild(useCustomCb);
  useCustomWrap.appendChild(useCustomText);

  const modelSelect = document.createElement("select");
  modelSelect.className = "mjr-ps-select";
  modelSelect.style.width = "100%";
  modelSelect.style.padding = "6px 8px";
  modelSelect.style.borderRadius = "8px";
  modelSelect.style.border = "1px solid rgba(255,255,255,0.12)";
  modelSelect.style.color = "#f2f4f8";

  const modelRow = document.createElement("div");
  modelRow.style.display = "flex";
  modelRow.style.gap = "8px";
  const modelToggleBtn = btn(state.showMoreModels ? "Show less" : "Show more");
  modelToggleBtn.style.padding = "4px 6px";
  modelToggleBtn.style.fontSize = "10px";
  modelToggleBtn.style.flex = "0 0 auto";
  modelToggleBtn.style.margin = "0";
  modelToggleBtn.style.alignSelf = "flex-end";
  const modelSelectWrap = row("Default Model", modelSelect);
  modelSelectWrap.style.flex = "1 1 auto";
  modelRow.appendChild(modelSelectWrap);

  const modelEmptyMsg = document.createElement("div");
  modelEmptyMsg.style.opacity = "0.8";
  modelEmptyMsg.style.display = "none";
  modelEmptyMsg.style.textAlign = "center";
  modelEmptyMsg.style.fontSize = "11px";
  modelEmptyMsg.style.color = "#f2d98a";
  modelEmptyMsg.textContent = "No models detected (check folders)";

  const customModelInput = document.createElement("input");
  customModelInput.type = "text";
  customModelInput.placeholder = "Custom model name";
  customModelInput.value = state.customModelText || "";

  const customModelWrap = row("Custom Model (UPPERCASE)", customModelInput);
  customModelWrap.style.display = state.useCustomModel ? "block" : "none";
  customModelWrap.style.flex = "1 1 auto";

  const customModelPreview = document.createElement("div");
  customModelPreview.style.opacity = "0.85";
  customModelPreview.style.fontSize = "9px";
  customModelPreview.style.color = "#f2d98a";
  customModelPreview.style.textAlign = "center";
  customModelPreview.textContent = "Custom tag: -";
  customModelWrap.appendChild(customModelPreview);

  const modelCustomRow = document.createElement("div");
  modelCustomRow.style.display = "flex";
  modelCustomRow.style.gap = "8px";
  modelCustomRow.style.alignItems = "flex-end";
  modelCustomRow.appendChild(customModelWrap);
  modelCustomRow.appendChild(modelToggleBtn);

  modelSection.appendChild(detectedModelLabel);
  modelSection.appendChild(useCustomWrap);
  modelSection.appendChild(modelRow);
  modelSection.appendChild(modelCustomRow);
  modelSection.appendChild(modelEmptyMsg);

  // Workflow section
  const workflowNameInput = document.createElement("input");
  workflowNameInput.type = "text";
  workflowNameInput.placeholder = "Workflow name (optional)";
  workflowNameInput.value = state.workflowName || "";

  const workflowAssetInput = document.createElement("input");
  workflowAssetInput.type = "text";
  workflowAssetInput.placeholder = "Asset folder (optional)";
  workflowAssetInput.value = state.workflowAsset || "";

  const workflowPreviewLabel = document.createElement("div");
  workflowPreviewLabel.style.opacity = "0.85";
  workflowPreviewLabel.style.textAlign = "center";
  workflowPreviewLabel.style.fontSize = "9px";
  workflowPreviewLabel.style.color = "#f2d98a";
  workflowPreviewLabel.textContent = "Next save: -";

  const saveWorkflowBtn = btn("Save Workflow to Project");
  saveWorkflowBtn.style.alignSelf = "center";
  saveWorkflowBtn.style.margin = "8px auto 0";
  saveWorkflowBtn.style.display = "block";

  const autoHookWrap = document.createElement("label");
  autoHookWrap.style.display = "flex";
  autoHookWrap.style.alignItems = "center";
  autoHookWrap.style.gap = "8px";
  autoHookWrap.style.cursor = "pointer";
  const autoHookCb = document.createElement("input");
  autoHookCb.type = "checkbox";
  autoHookCb.checked = state.autoHookSave !== false;
  const autoHookText = document.createElement("span");
  autoHookText.textContent = "Auto-hook Ctrl+S";
  autoHookText.style.opacity = "0.9";
  autoHookWrap.appendChild(autoHookCb);
  autoHookWrap.appendChild(autoHookText);

  // Custom output section (collapsible)
  const customOutputSection = detailsSection("Custom Output (optional)");

  const kindSelect = document.createElement("select");
  kindSelect.className = "mjr-ps-select";
  for (const [value, label] of [
    ["asset", "Asset"],
    ["shot", "Shot"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    kindSelect.appendChild(opt);
  }
  kindSelect.value = state.kind || "asset";

  const mediaSelect = document.createElement("select");
  mediaSelect.className = "mjr-ps-select";
  for (const [value, label] of [
    ["images", "Images"],
    ["videos", "Videos"],
  ]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    mediaSelect.appendChild(opt);
  }
  mediaSelect.value = state.media || "images";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Asset/shot name";
  nameInput.value = state.name || "";

  const autoPatchWrap = document.createElement("label");
  autoPatchWrap.style.display = "flex";
  autoPatchWrap.style.alignItems = "center";
  autoPatchWrap.style.gap = "8px";
  autoPatchWrap.style.cursor = "pointer";
  const autoPatchCb = document.createElement("input");
  autoPatchCb.type = "checkbox";
  autoPatchCb.checked = state.autoPatch !== false;
  const autoPatchText = document.createElement("span");
  autoPatchText.textContent = "Auto patch outputs";
  autoPatchText.style.opacity = "0.9";
  autoPatchWrap.appendChild(autoPatchCb);
  autoPatchWrap.appendChild(autoPatchText);

  const createApplyBtn = btn("Create + Apply");
  const patchNowBtn = btn("Patch now");

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "8px";
  buttonRow.style.justifyContent = "center";
  buttonRow.style.alignItems = "center";
  buttonRow.style.marginTop = "4px";
  buttonRow.style.marginBottom = "4px";
  buttonRow.appendChild(createApplyBtn);
  buttonRow.appendChild(patchNowBtn);

  const targetLabel = document.createElement("div");
  targetLabel.style.opacity = "0.85";
  targetLabel.style.textAlign = "center";
  targetLabel.style.fontSize = "9px";
  targetLabel.style.color = "#f2d98a";
  if (state.lastRelDir) {
    targetLabel.textContent = `Target: ${state.lastRelDir} | Prefix: ${state.lastPrefix}`;
  } else {
    targetLabel.textContent = "Target: none (create an output)";
  }

  // Advanced template
  const advanced = document.createElement("details");
  advanced.style.marginTop = "4px";
  const summary = document.createElement("summary");
  summary.textContent = "Advanced";
  summary.style.cursor = "pointer";
  summary.style.opacity = "0.85";
  summary.style.textTransform = "uppercase";
  summary.style.letterSpacing = "0.6px";
  summary.style.color = "#8fb9ff";

  const templateInput = document.createElement("input");
  templateInput.type = "text";
  templateInput.placeholder = "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";
  templateInput.value =
    state.pathTemplate || "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";

  const templateTokens = document.createElement("div");
  templateTokens.style.opacity = "0.85";
  templateTokens.style.fontSize = "8px";
  templateTokens.style.color = "#f2d98a";
  templateTokens.style.textAlign = "center";
  templateTokens.textContent = `Tokens: ${TEMPLATE_TOKENS.join(" ")}`;

  const previewLabel = document.createElement("div");
  previewLabel.style.opacity = "0.85";
  previewLabel.style.fontSize = "8px";
  previewLabel.style.color = "#f2d98a";
  previewLabel.style.textAlign = "center";
  previewLabel.textContent = "Preview: -";

  advanced.appendChild(summary);
  advanced.appendChild(row("Path Template", templateInput));
  advanced.appendChild(templateTokens);
  advanced.appendChild(previewLabel);

  const workflowSaveWrap = detailsSection("Workflow");
  workflowSaveWrap.open = true;
  workflowSaveWrap.style.padding = "8px 10px";
  workflowSaveWrap.style.borderRadius = "8px";
  workflowSaveWrap.style.border = "1px solid rgba(255,255,255,0.12)";
  workflowSaveWrap.style.background = "rgba(15, 17, 22, 0.75)";
  workflowSaveWrap.style.backdropFilter = "blur(6px)";
  const workflowSaveContent = document.createElement("div");
  workflowSaveContent.style.display = "flex";
  workflowSaveContent.style.flexDirection = "column";
  workflowSaveContent.style.gap = "8px";
  workflowSaveContent.appendChild(row("Workflow name", workflowNameInput));
  workflowSaveContent.appendChild(row("Asset folder", workflowAssetInput));
  workflowSaveContent.appendChild(workflowPreviewLabel);
  workflowSaveContent.appendChild(autoHookWrap);
  workflowSaveContent.appendChild(saveWorkflowBtn);
  workflowSaveWrap.appendChild(workflowSaveContent);

  container.appendChild(statusBar);
  container.appendChild(workflowWrap);
  container.appendChild(resolveWrap);
  container.appendChild(divider());
  container.appendChild(modelSection);
  container.appendChild(autoPatchNewWrap);
  container.appendChild(autoSwitchWrap);
  container.appendChild(divider());
  container.appendChild(workflowSaveWrap);
  container.appendChild(divider());
  customOutputSection.appendChild(row("Kind", kindSelect));
  customOutputSection.appendChild(row("Media", mediaSelect));
  customOutputSection.appendChild(row("Name", nameInput));
  customOutputSection.appendChild(autoPatchWrap);
  customOutputSection.appendChild(buttonRow);
  customOutputSection.appendChild(targetLabel);
  container.appendChild(customOutputSection);
  container.appendChild(divider());
  container.appendChild(advanced);

  el.appendChild(container);
  updateStatus();
  updateResolve();
  updateWorkflowBlock();

  const isEditableTarget = (target) => {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
  };

  container.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      if (key === "a") {
        event.preventDefault();
        createApplyBtn.click();
      } else if (key === "p") {
        event.preventDefault();
        patchNowBtn.click();
      }
    }
  });

  const resolveModel = () => {
    if (useCustomCb.checked) {
      const tag = token3Tag(customModelInput.value, true);
      return {
        modelRaw: customModelInput.value || "Unknown",
        modelUpper: true,
        tag: tag || "UNKNOWN",
      };
    }
    if (state.detectedModelTag) {
      return {
        modelRaw: state.detectedModelTag,
        modelUpper: false,
        tag: state.detectedModelTag,
      };
    }
    const sel = modelSelect.value || "Unknown";
    const tag = token3Tag(sel, false);
    return { modelRaw: sel, modelUpper: false, tag: tag || "Unknown" };
  };

  const buildWorkflowName = () => {
    const modelInfo = resolveModel();
    const modelTag = modelInfo.tag || "Model";
    const assetName = titlePathJS(nameInput.value || "Asset");
    return `${yymmddJS()}_${modelTag}_${assetName}`;
  };

  const buildWorkflowPreview = () => {
    const base = buildWorkflowName();
    const next =
      base && state.workflowLastBase === base
        ? Number(state.workflowNextSuffix || 1)
        : 1;
    const suffix = String(next).padStart(4, "0");
    return `${base}_${suffix}.json`;
  };

  const updatePreview = () => {
    const baseRel = state.projectFolder
      ? `PROJECTS/${state.projectFolder}`
      : "PROJECTS/<PROJECT_FOLDER>";
    const modelInfo = resolveModel();
    const tokens = {
      BASE: baseRel,
      MEDIA: mediaDir(mediaSelect.value),
      DATE: yymmddJS(),
      MODEL: modelInfo.tag,
      NAME: titlePathJS(nameInput.value || "Name"),
      KIND: makeKindToken(kindSelect.value),
    };
    const preview = resolveTemplatePreview(templateInput.value, tokens);
    previewLabel.textContent = preview ? `Preview: ${preview}` : "Preview: -";
    detectedModelLabel.textContent = `Detected: ${state.detectedModelTag || "-"}`;
    customModelPreview.textContent = useCustomCb.checked
      ? `Custom tag: ${modelInfo.tag}`
      : "Custom tag: -";
    if (modelSummary) {
      const activeTag = modelInfo.tag || "-";
      modelSummary.textContent = `MODEL (${activeTag})`;
    }
    const assetFolder = titlePathJS(workflowAssetInput.value || "");
    const workflowFile = buildWorkflowPreview();
    const workflowRel = assetFolder
      ? `03_WORKFLOWS/${assetFolder}/${workflowFile}`
      : `03_WORKFLOWS/${workflowFile}`;
    workflowPreviewLabel.textContent = `Next save: ${workflowRel}`;
    modelSelect.disabled = !!state.detectedModelTag && !useCustomCb.checked;
    modelSelect.style.opacity = modelSelect.disabled ? "0.6" : "1";
  };

  const updateState = () => {
    state.workflowName = workflowNameInput.value;
    state.workflowAsset = workflowAssetInput.value;
    state.kind = kindSelect.value;
    state.media = mediaSelect.value;
    state.name = nameInput.value;
    state.customModelText = customModelInput.value;
    state.modelSelection = modelSelect.value;
    state.autoPatch = autoPatchCb.checked;
    state.autoPatchNewNodes = autoPatchNewCb.checked;
    state.autoSwitchTrusted = autoSwitchCb.checked;
    state.autoHookSave = autoHookCb.checked;
    state.useCustomModel = useCustomCb.checked;
    state.modelUpper = useCustomCb.checked;
    state.pendingProjectName = pendingProjectNameInput.value;
    state.pendingSelectProjectId = pendingSelect.value;
    state.pathTemplate = templateInput.value;
    customModelWrap.style.display = useCustomCb.checked ? "block" : "none";
    saveState(state);
    updateStatus();
    updateResolve();
    updateWorkflowBlock();
    updatePreview();
    if (!state.lastRelDir) {
      targetLabel.textContent = "Target: none (create an output)";
    }
  };

  const setWorkflowName = (value) => {
    workflowNameInput.value = value || "";
    state.workflowName = workflowNameInput.value;
    saveState(state);
    updatePreview();
  };

  const resetForProjectChange = () => {
    state.projectName = "";
    state.workflowName = "";
    state.workflowAsset = "";
    state.workflowLastBase = "";
    state.workflowNextSuffix = 1;
    state.workflowPanelOpen = false;
    state.name = "";
    state.kind = "asset";
    state.media = "images";
    state.modelSelection = "";
    state.useCustomModel = false;
    state.customModelText = "";
    state.modelUpper = false;
    state.lastRelDir = "";
    state.lastPrefix = "";
    state.pathTemplate = "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";

    workflowNameInput.value = "";
    workflowAssetInput.value = "";
    nameInput.value = "";
    kindSelect.value = "asset";
    mediaSelect.value = "images";
    if (modelSelect.options.length > 0) {
      modelSelect.selectedIndex = 0;
    }
    useCustomCb.checked = false;
    customModelInput.value = "";
    customModelWrap.style.display = "none";
    templateInput.value = state.pathTemplate;
    targetLabel.textContent = "Target: none (create an output)";
    updateState();
    updatePreview();
  };

  state._ui = {
    updateStatus,
    updateResolve,
    updatePreview,
    updateWorkflowBlock,
    resetForProjectChange,
    buildWorkflowName,
    setWorkflowName,
  };

  // Store full project list for search filtering
  let allProjects = [];

  const updateProjectDropdowns = (filteredList) => {
    pendingSelect.innerHTML = "";
    const pendingEmpty = document.createElement("option");
    pendingEmpty.value = "";
    pendingEmpty.textContent = "-";
    pendingSelect.appendChild(pendingEmpty);

    for (const p of filteredList) {
      const opt = document.createElement("option");
      opt.value = p.project_id;
      opt.dataset.folder = p.folder || "";
      opt.dataset.exists = p.exists === false ? "false" : "true";
      const missingTag = p.exists === false ? " (missing)" : "";
      const archivedTag = p.archived ? " [archived]" : "";
      opt.textContent = `${p.folder || p.project_id} (${p.project_id})${missingTag}${archivedTag}`;
      pendingSelect.appendChild(opt);
    }
  };

  const refreshProjectsList = async () => {
    try {
      const resp = await fetchJSON("/mjr_project/list");
      allProjects = resp.projects || [];
      state.lastError = "";

      updateProjectDropdowns(allProjects);
      if (state.projectId) {
        const active = allProjects.find((p) => p.project_id === state.projectId);
        state.projectExists = active ? active.exists !== false : false;
      }
      if (state.pendingSelectProjectId) {
        pendingSelect.value = state.pendingSelectProjectId;
      }
      updateStatus();
      updateResolve();
      updateWorkflowBlock();
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Projects list failed", state.lastError);
      console.error(e);
    }
  };

  workflowNameInput.addEventListener("input", updateState);
  workflowAssetInput.addEventListener("input", updateState);
  kindSelect.addEventListener("change", updateState);
  mediaSelect.addEventListener("change", updateState);
  nameInput.addEventListener("input", updateState);
  customModelInput.addEventListener("input", updateState);
  useCustomCb.addEventListener("change", updateState);
  autoPatchCb.addEventListener("change", updateState);
  autoPatchNewCb.addEventListener("change", updateState);
  autoSwitchCb.addEventListener("change", updateState);
  autoHookCb.addEventListener("change", updateState);
  templateInput.addEventListener("input", updateState);
  pendingProjectNameInput.addEventListener("input", updateState);
  pendingSelect.addEventListener("change", updateState);

  saveWorkflowBtn.addEventListener("click", async () => {
    updateState();
    const wfName = workflowNameInput.value.trim();
    await saveWorkflowToProject(state, wfName);
  });

  switchBtn.addEventListener("click", async () => {
    const det = state.detected;
    if (!det || det.mode === "none") {
      toast("warn", "No detected project", "Nothing to switch to.");
      return;
    }
    try {
      if (det.project_id) {
        await setActiveProjectById(state, det.project_id);
      } else if (det.project_folder) {
        const resp = await fetchJSON("/mjr_project/set", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_name: det.project_folder, create_base: true }),
        });
        state.projectId = resp.project_id;
        state.projectFolder = resp.project_folder;
        state.projectExists = true;
        state.lastError = "";
        saveState(state);
        resetForProjectChange();
        refreshProjectsList();
        toast("success", "Project active", resp.project_folder);
      } else {
        toast("warn", "No detected project", "No folder available to switch.");
        return;
      }
      state.detected = null;
      updateResolve();
      state.workflowHasSignature = true;
      updateWorkflowBlock();
      stampGraphProjectSignature(app, state);
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Switch failed", state.lastError);
    }
  });

  const assignWorkflowToActive = async () => {
    if (!state.projectId || !state.projectFolder) {
      toast("error", "No active project", "Set a project first.");
      return;
    }
    stampGraphProjectSignature(app, state);
    state.workflowHasSignature = true;
    state.workflowPanelOpen = false;
    toast("success", "Workflow assigned", state.projectFolder);
    const doPatch = await psConfirm({
      title: "Patch save paths?",
      message: "Patch save paths to the active project?",
    });
    if (doPatch) {
      const base = `PROJECTS/${state.projectFolder}`;
      const imgRel = joinRel(base, mediaDir("images"));
      const vidRel = joinRel(base, mediaDir("videos"));
      const patched =
        patchSaveNodes(app, imgRel, "", "images") +
        patchSaveNodes(app, vidRel, "", "videos");
      if (patched > 0) {
        toast("success", "Patch applied", `Updated ${patched} nodes.`);
      } else {
        toast("warn", "No nodes patched", "No save-like nodes were updated.");
      }
    } else {
      toast("info", "Patch skipped", "Save paths were not changed.");
    }
    state.detected = null;
    updateStatus();
    updateResolve();
    updateWorkflowBlock();
  };

  assignBtn.addEventListener("click", assignWorkflowToActive);

  createBtn.addEventListener("click", async () => {
    const det = state.detected;
    const suggested = det?.project_folder || "New_Project";
    const entered = await psPrompt({
      title: "Create project",
      message: "Enter a project name",
      defaultValue: suggested,
    });
    if (entered === null) {
      toast("info", "Create cancelled", "No project name provided.");
      return;
    }
    const projectName = String(entered || "").trim();
    if (!projectName) {
      toast("error", "Validation", "Project name is required.");
      return;
    }
    try {
      await createAndActivateProject(state, projectName, {
        updateStatus,
        updateResolve,
        updateWorkflowBlock,
        resetForProjectChange,
        updatePreview,
        refreshProjectsList,
      });
      state.detected = null;
      updateResolve();
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Create failed", state.lastError);
    }
  });

  dismissBtn.addEventListener("click", () => {
    state.detected = null;
    updateResolve();
  });

  wfCreateBtn.addEventListener("click", async () => {
    const name = pendingProjectNameInput.value.trim();
    if (!name) {
      toast("error", "Validation", "Project name is required.");
      return;
    }
    try {
      await createAndActivateProject(state, name, {
        updateStatus,
        updateResolve,
        updateWorkflowBlock,
        resetForProjectChange,
        updatePreview,
        refreshProjectsList,
      });
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Create failed", state.lastError);
    }
  });

  wfActivateBtn.addEventListener("click", async () => {
    const projectId = pendingSelect.value;
    if (!projectId) {
      toast("error", "Validation", "Select a project first.");
      return;
    }
    try {
      await setActiveProjectById(state, projectId);
      state.workflowHasSignature = true;
      updateWorkflowBlock();
      stampGraphProjectSignature(app, state);
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Activate failed", state.lastError);
    }
  });

  wfAssignBtn.addEventListener("click", assignWorkflowToActive);

  modelSelect.addEventListener("change", updateState);

  const loadModels = async () => {
    try {
      const resp = await fetchJSON("/mjr_project/models");
      const categories = resp.categories || {};
      modelSelect.innerHTML = "";

      const primaryCats = ["diffusion_models", "checkpoints"];
      const extraCats = Object.keys(categories).filter(
        (c) => !primaryCats.includes(c)
      );

      const addGroup = (cat) => {
        const items = categories[cat] || [];
        if (!Array.isArray(items) || items.length === 0) return 0;
        const group = document.createElement("optgroup");
        group.label = cat;
        for (const item of items) {
          const opt = document.createElement("option");
          opt.value = item;
          opt.textContent = item;
          group.appendChild(opt);
        }
        modelSelect.appendChild(group);
        return items.length;
      };

      let total = 0;
      for (const cat of primaryCats) {
        total += addGroup(cat);
      }
      if (state.showMoreModels) {
        for (const cat of extraCats) {
          total += addGroup(cat);
        }
      }

      if (total === 0) {
        const opt = document.createElement("option");
        opt.value = "Unknown";
        opt.textContent = "Unknown";
        modelSelect.appendChild(opt);
      }
      modelEmptyMsg.style.display = total === 0 ? "block" : "none";

      if (state.modelSelection) {
        modelSelect.value = state.modelSelection;
      }
      if (!modelSelect.value && modelSelect.options.length > 0) {
        modelSelect.selectedIndex = 0;
      }
      updateState();
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Model list failed", state.lastError);
      console.error(e);
    }
  };

  modelToggleBtn.addEventListener("click", () => {
    state.showMoreModels = !state.showMoreModels;
    modelToggleBtn.textContent = state.showMoreModels ? "Show less" : "Show more";
    saveState(state);
    loadModels();
  });

  createApplyBtn.addEventListener("click", async () => {
    if (!state.projectId) {
      state.lastError = "set project first";
      updateStatus();
      toast("error", "Validation", "Set a project first.");
      return;
    }
    const name = nameInput.value.trim();
    if (!name) {
      state.lastError = "name required";
      updateStatus();
      toast("error", "Validation", "Name is required.");
      return;
    }

    if (useCustomCb.checked && !customModelInput.value.trim()) {
      toast("error", "Validation", "Custom model is required.");
      return;
    }
    const modelInfo = resolveModel();
    const modelName = modelInfo.modelRaw || "Unknown";

    try {
      const resp = await fetchJSON("/mjr_project/create_custom_out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: state.projectId,
          kind: kindSelect.value,
          name,
          media: mediaSelect.value,
          model: modelName,
          model_upper: modelInfo.modelUpper === true,
          date: yymmddJS(),
          template: templateInput.value,
        }),
      });

      state.lastRelDir = resp.rel_dir;
      state.lastPrefix = resp.filename_prefix;
      state.media = resp.media || mediaSelect.value;
      state.kind = resp.kind || kindSelect.value;
      state.projectExists = true;
      state.workflowHasSignature = true;
      state.lastError = "";
      saveState(state);
      updateStatus();
      updateWorkflowBlock();

      targetLabel.textContent = `Target: ${resp.rel_dir} | Prefix: ${resp.filename_prefix}`;

      if (autoPatchCb.checked) {
        const patched = patchSaveNodes(app, resp.rel_dir, resp.filename_prefix, resp.media);
        if (patched > 0) {
          toast("success", "Patch applied", `Updated ${patched} nodes.`);
        } else {
          toast("warn", "No nodes patched", "No save-like nodes were updated.");
        }
      }
      stampGraphProjectSignature(app, state);
      toast("success", "Folder created", resp.rel_dir);
      refreshProjectsList();
    } catch (e) {
      state.lastError = String(e.message || e);
      updateStatus();
      toast("error", "Create failed", state.lastError);
      console.error(e);
    }
  });

  patchNowBtn.addEventListener("click", async () => {
    if (!state.lastRelDir || !state.lastPrefix) {
      targetLabel.textContent = "Target: none (create an output)";
      toast("warn", "No target", "Create an output first.");
      return;
    }

    // Count save nodes first
    const saveNodes = (app.graph?._nodes || []).filter(n => isSaveLikeNode(n));
    const nodeCount = saveNodes.length;

    if (nodeCount === 0) {
      toast("warn", "No nodes to patch", "No save-like nodes found in workflow.");
      return;
    }

    // Ask for confirmation
    const confirmed = await psConfirm({
      title: "Patch save paths?",
      message:
        `Update ${nodeCount} save node${nodeCount !== 1 ? "s" : ""} to use the project path?\n\n` +
        `Path: ${state.lastRelDir}\n` +
        `Prefix: ${state.lastPrefix}\n\n` +
        `This can be undone with Ctrl+Z.`,
    });

    if (!confirmed) {
      toast("info", "Cancelled", "No nodes were modified.");
      return;
    }

    const patched = patchSaveNodes(app, state.lastRelDir, state.lastPrefix, state.media);
    if (patched > 0) {
      toast("success", "Patch applied", `Updated ${patched} node${patched !== 1 ? 's' : ''}.`);
    } else {
      toast("warn", "No nodes patched", "No save-like nodes were updated.");
    }
    stampGraphProjectSignature(app, state);
  });

  loadModels();
  refreshProjectsList();
  updatePreview();
}

app.registerExtension({
  name: "Majoor.ProjectSettings",

  async setup() {
    const canSidebar = !!app?.extensionManager?.registerSidebarTab;
    const state = Object.assign(
      {
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
      },
      loadState() || {}
    );

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
    runtimeState = state;
    registerWorkflowShortcut();
    const renderPanel = (el) => buildPanel(el, state);

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
    }
  },

  async afterConfigureGraph() {
    if (runtimeState) {
      runtimeState.isGraphLoading = false;
      onGraphLoadedDetectProject(runtimeState);
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
    if (!state.projectId || !state.autoPatchNewNodes) return;
    if (!state.projectFolder || state.projectExists === false) return;

    if (!isSaveLikeNode(node)) return;

    const widgets = node?.widgets || [];
    const filenameWidget = widgets.find((w) => w?.name === "filename_prefix");
    const pathWidget = widgets.find((w) => w?.name && PATH_WIDGETS.includes(w.name));
    if (!filenameWidget && !pathWidget) return;

    if (filenameWidget && alreadyProjectPathed(filenameWidget.value)) {
      toast("warn", "Patch skipped", "Node already points to a project path.");
      return;
    }
    if (pathWidget && alreadyProjectPathed(pathWidget.value)) {
      toast("warn", "Patch skipped", "Node already points to a project path.");
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
    }
  },
});


