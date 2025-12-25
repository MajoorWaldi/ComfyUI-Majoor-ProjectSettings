import { app } from "../../scripts/app.js";
import { joinRel, makeKindToken, mediaDir, titlePathJS, token3Tag, yymmddJS } from "./mjr/utils.js";
import { ensureStyles, toast } from "./mjr/toast.js";
import {
  buildFingerprintCache,
  downloadModels,
  fetchJSON,
  getDownloadStatus,
  getFingerprintCacheStatus,
  getModels,
  listExistingNames,
  previewTemplate,
  resolveModelRecipes,
  saveModelRecipes,
  scanModelCandidates,
} from "./mjr/api.js";
import { psConfirm, psPrompt } from "./mjr/dialog.js";
import {
  alreadyProjectPathed,
  detectNodeMedia,
  isSaveLikeNode,
  patchSaveNodes,
  patchSingleNode,
  stampGraphProjectSignature,
} from "./mjr/patch.js";
import {
  applyFixesToGraph,
  scanMissingModelsFromGraph,
  scanMissingModelsWithStats,
} from "./mjr/model_fixer.js";
import { collectNoteRecipes, getKindOptions, normalizeKey, typeHintToKind } from "./mjr/model_downloader.js";
import { showModelFixerDialog } from "./mjr/ui_model_fixer_dialog.js";
import { showModelDownloaderDialog } from "./mjr/ui_model_downloader_dialog.js";
import { saveState } from "./state_manager.js";
import { getSerializedWorkflow } from "./mjr/graph.js";
import { extractNoteTexts } from "./mjr/workflow_note_recipes.js";
import { debug } from "./mjr/log.js";

const TEMPLATE_TOKENS = ["{BASE}", "{MEDIA}", "{DATE}", "{MODEL}", "{NAME}", "{KIND}"];

const PROJECT_REFRESH_THROTTLE_MS = 5000;
const PROJECT_REFRESH_ERROR_BACKOFF_MS = 10000;
const SETTING_AUTO_FIX_AFTER_DOWNLOAD = "mjr_project.auto_fix_after_download";
const SETTING_AUTO_SCAN_MISSING_ON_OPEN = "mjr_project.auto_scan_missing_on_open";
const SETTING_AUTO_REMEMBER_NOTE_SOURCES = "mjr_project.auto_remember_note_sources";
const SETTING_NO_PROJECT_STATUS_BLACK = "mjr_project.status_black_no_project";

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
  if (state.graphIsEmpty) {
    return { color: "#b33a3a", text: "Empty graph, set or create a project", level: "red" };
  }
  if (!state.projectId) {
    if (getSettingBool(SETTING_NO_PROJECT_STATUS_BLACK, false)) {
      return { color: "#000000", text: "No project (test)", level: "black" };
    }
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
      text: "Active project, workflow unassigned",
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
export function buildPanel(el, state, actions) {
  const { createAndActivateProject, setActiveProjectById, saveWorkflowToProject } = actions || {};
  el.innerHTML = "";
  ensureStyles();

  const UI_GAP = "8px";

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = UI_GAP;
  container.style.fontSize = "12px";
  container.style.color = "#ddd";
  container.style.fontFamily = "inherit";
  container.style.padding = "8px 14px 16px";

  const section = (label) => {
    const h = document.createElement("div");
    h.textContent = label;
    h.style.fontWeight = "600";
    h.style.marginTop = UI_GAP;
    h.style.marginBottom = UI_GAP;
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
    d.style.margin = "0";
    return d;
  };

  const detailsSection = (title) => {
    const details = document.createElement("details");
    details.style.marginTop = "0";
    details.style.display = "flex";
    details.style.flexDirection = "column";
    details.style.gap = UI_GAP;
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

  const makeLabel = (labelText) => {
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.opacity = "0.85";
    label.style.marginLeft = "2px";
    label.style.fontSize = "11px";
    label.style.lineHeight = "1.2";
    return label;
  };

  const styleField = (inputEl) => {
    inputEl.style.width = "100%";
    inputEl.style.boxSizing = "border-box";
    inputEl.style.padding = "6px 8px";
    inputEl.style.borderRadius = "8px";
    inputEl.style.border = "1px solid rgba(255,255,255,0.12)";
    inputEl.style.background = "rgba(0,0,0,0.25)";
    inputEl.style.color = "#eee";
    inputEl.style.outline = "none";
  };

  const row = (labelText, inputEl) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = UI_GAP;
    wrap.appendChild(makeLabel(labelText));
    styleField(inputEl);
    wrap.appendChild(inputEl);
    return wrap;
  };

  const groupRow = (labelText, contentEl) => {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = UI_GAP;
    wrap.appendChild(makeLabel(labelText));
    wrap.appendChild(contentEl);
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
  statusBar.style.gap = UI_GAP;
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
    let show = true;
    if (!det || det.mode === "none") {
      show = false;
    }
    const sameProject =
      det &&
      det.mode !== "none" &&
      ((det.project_id && det.project_id === state.projectId) ||
        (det.project_folder && det.project_folder === state.projectFolder));
    if (sameProject) {
      show = false;
    }
    if (!show) {
      resolveWrap.style.display = "none";
      return;
    }

    if (state.workflowPanelOpen) {
      state.workflowPanelOpen = false;
      saveState(state);
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
  resolveWrap.style.gap = UI_GAP;
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
  resolveTitle.style.marginBottom = "0";

  const resolveInfo = document.createElement("div");
  resolveInfo.style.opacity = "0.9";

  const resolveActive = document.createElement("div");
  resolveActive.style.opacity = "0.85";

  const resolveBtns = document.createElement("div");
  resolveBtns.style.display = "flex";
  resolveBtns.style.gap = UI_GAP;
  resolveBtns.style.flexWrap = "wrap";
  resolveBtns.style.justifyContent = "center";
  resolveBtns.style.alignItems = "center";
  resolveBtns.style.marginTop = "0";

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
  workflowWrap.style.gap = UI_GAP;
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
  workflowTitle.style.marginBottom = "0";

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
  wfButtons.style.gap = UI_GAP;
  wfButtons.style.flexWrap = "wrap";
  wfButtons.style.justifyContent = "center";
  wfButtons.style.alignItems = "center";
  wfButtons.style.marginTop = "0";
  wfButtons.appendChild(wfCreateBtn);
  wfButtons.appendChild(wfActivateBtn);
  wfButtons.appendChild(wfAssignBtn);

  workflowWrap.appendChild(workflowTitle);
  workflowWrap.appendChild(row("Project name", pendingProjectNameInput));
  workflowWrap.appendChild(row("Or select existing project", pendingSelect));
  workflowWrap.appendChild(wfButtons);

  let refreshProjectsList = () => {};

  const updateWorkflowBlock = () => {
    const show = !!state.workflowPanelOpen;
    workflowWrap.style.display = show ? "flex" : "none";
    if (show) {
      refreshProjectsList();
      pendingProjectNameInput.value = state.pendingProjectName || "";
      if (state.pendingSelectProjectId) {
        pendingSelect.value = state.pendingSelectProjectId;
      }
    }
  };

  const autoPatchNewWrap = document.createElement("label");
  autoPatchNewWrap.style.display = "flex";
  autoPatchNewWrap.style.alignItems = "center";
  autoPatchNewWrap.style.gap = UI_GAP;
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
  autoSwitchWrap.style.gap = UI_GAP;
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
  detectedModelLabel.style.textAlign = "left";
  detectedModelLabel.style.marginLeft = "2px";
  detectedModelLabel.style.marginTop = "0";
  detectedModelLabel.textContent = "Detected: -";

  const useCustomWrap = document.createElement("label");
  useCustomWrap.style.display = "flex";
  useCustomWrap.style.alignItems = "center";
  useCustomWrap.style.gap = UI_GAP;
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
  modelRow.style.gap = UI_GAP;
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
  modelCustomRow.style.gap = UI_GAP;
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
  workflowPreviewLabel.style.textAlign = "left";
  workflowPreviewLabel.style.fontSize = "9px";
  workflowPreviewLabel.style.color = "#f2d98a";
  workflowPreviewLabel.style.lineHeight = "1.35";
  workflowPreviewLabel.style.wordBreak = "break-word";
  workflowPreviewLabel.textContent = "Next save: -";

  const saveWorkflowBtn = btn("Save Workflow to Project");
  saveWorkflowBtn.style.alignSelf = "center";
  saveWorkflowBtn.style.margin = "0 auto";
  saveWorkflowBtn.style.display = "block";

  const autoHookWrap = document.createElement("label");
  autoHookWrap.style.display = "flex";
  autoHookWrap.style.alignItems = "center";
  autoHookWrap.style.gap = UI_GAP;
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
  customOutputSection.style.display = "flex";
  customOutputSection.style.flexDirection = "column";
  customOutputSection.style.gap = UI_GAP;

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
  styleField(nameInput);

  const existingNamesSelect = document.createElement("select");
  existingNamesSelect.className = "mjr-ps-select";
  existingNamesSelect.style.display = "none";
  styleField(existingNamesSelect);

  const nameStack = document.createElement("div");
  nameStack.style.display = "flex";
  nameStack.style.flexDirection = "column";
  nameStack.style.gap = UI_GAP;
  nameStack.style.width = "100%";
  nameStack.appendChild(existingNamesSelect);
  nameStack.appendChild(nameInput);

  const autoPatchWrap = document.createElement("label");
  autoPatchWrap.style.display = "flex";
  autoPatchWrap.style.alignItems = "center";
  autoPatchWrap.style.gap = UI_GAP;
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
  buttonRow.style.gap = UI_GAP;
  buttonRow.style.justifyContent = "center";
  buttonRow.style.alignItems = "center";
  buttonRow.style.marginTop = "0";
  buttonRow.style.marginBottom = "0";
  buttonRow.appendChild(createApplyBtn);
  buttonRow.appendChild(patchNowBtn);

  const targetLabel = document.createElement("div");
  targetLabel.style.opacity = "0.85";
  targetLabel.style.textAlign = "left";
  targetLabel.style.fontSize = "9px";
  targetLabel.style.color = "#f2d98a";
  targetLabel.style.lineHeight = "1.35";
  targetLabel.style.wordBreak = "break-word";
  if (state.lastRelDir) {
    targetLabel.textContent = `Target: ${state.lastRelDir} | Prefix: ${state.lastPrefix}`;
  } else {
    targetLabel.textContent = "Target: none (create an output)";
  }

  // Advanced template
  const advanced = document.createElement("details");
  advanced.style.marginTop = "0";
  advanced.style.display = "flex";
  advanced.style.flexDirection = "column";
  advanced.style.gap = UI_GAP;
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
  templateTokens.style.textAlign = "left";
  templateTokens.style.lineHeight = "1.35";
  templateTokens.style.wordBreak = "break-word";
  templateTokens.textContent = `Tokens: ${TEMPLATE_TOKENS.join(" ")}`;

  const previewLabel = document.createElement("div");
  previewLabel.style.opacity = "0.85";
  previewLabel.style.fontSize = "8px";
  previewLabel.style.color = "#f2d98a";
  previewLabel.style.textAlign = "left";
  previewLabel.style.lineHeight = "1.35";
  previewLabel.style.wordBreak = "break-word";
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
  workflowSaveContent.style.gap = UI_GAP;
  workflowSaveContent.appendChild(row("Workflow name", workflowNameInput));
  workflowSaveContent.appendChild(row("Asset folder", workflowAssetInput));
  workflowSaveContent.appendChild(workflowPreviewLabel);
  workflowSaveContent.appendChild(autoHookWrap);
  workflowSaveContent.appendChild(saveWorkflowBtn);
  workflowSaveWrap.appendChild(workflowSaveContent);

  const workflowUtilsWrap = detailsSection("Workflow Utilities");
  workflowUtilsWrap.open = true;
  workflowUtilsWrap.style.padding = "8px 10px";
  workflowUtilsWrap.style.borderRadius = "8px";
  workflowUtilsWrap.style.border = "1px solid rgba(255,255,255,0.12)";
  workflowUtilsWrap.style.background = "rgba(15, 17, 22, 0.75)";
  workflowUtilsWrap.style.backdropFilter = "blur(6px)";

  const workflowUtilsContent = document.createElement("div");
  workflowUtilsContent.style.display = "flex";
  workflowUtilsContent.style.flexDirection = "column";
  workflowUtilsContent.style.gap = UI_GAP;

  const fixMissingBtn = btn("Fix Missing Models");
  fixMissingBtn.style.alignSelf = "flex-start";

  const downloadMissingBtn = btn("Download Missing Models");
  downloadMissingBtn.style.alignSelf = "flex-start";

  const utilsButtonRow = document.createElement("div");
  utilsButtonRow.style.display = "flex";
  utilsButtonRow.style.gap = UI_GAP;
  utilsButtonRow.style.justifyContent = "flex-start";
  utilsButtonRow.style.alignItems = "center";
  utilsButtonRow.style.flexWrap = "wrap";
  utilsButtonRow.appendChild(fixMissingBtn);
  utilsButtonRow.appendChild(downloadMissingBtn);

  const fixerStatus = document.createElement("div");
  fixerStatus.style.opacity = "0.85";
  fixerStatus.style.fontSize = "9px";
  fixerStatus.style.color = "#f2d98a";
  fixerStatus.style.lineHeight = "1.35";
  fixerStatus.style.marginLeft = "2px";

  const downloadStatus = document.createElement("div");
  downloadStatus.style.display = "flex";
  downloadStatus.style.flexDirection = "column";
  downloadStatus.style.gap = "4px";
  downloadStatus.style.opacity = "0.85";
  downloadStatus.style.fontSize = "9px";
  downloadStatus.style.color = "#f2d98a";
  downloadStatus.style.lineHeight = "1.35";
  downloadStatus.style.marginLeft = "2px";

  const downloadStatusText = document.createElement("div");
  downloadStatus.appendChild(downloadStatusText);

  const downloadProgressWrap = document.createElement("div");
  downloadProgressWrap.style.height = "6px";
  downloadProgressWrap.style.width = "100%";
  downloadProgressWrap.style.borderRadius = "999px";
  downloadProgressWrap.style.border = "1px solid rgba(255,255,255,0.12)";
  downloadProgressWrap.style.background = "rgba(0,0,0,0.25)";
  downloadProgressWrap.style.overflow = "hidden";

  const downloadProgressBar = document.createElement("div");
  downloadProgressBar.style.height = "100%";
  downloadProgressBar.style.width = "0%";
  downloadProgressBar.style.background = "rgba(46, 136, 255, 0.7)";
  downloadProgressBar.style.transition = "width 0.2s ease";
  downloadProgressWrap.appendChild(downloadProgressBar);
  downloadStatus.appendChild(downloadProgressWrap);

  const fingerprintDetails = detailsSection("Advanced (Fingerprint)");
  fingerprintDetails.style.marginTop = "0";

  const fingerprintContent = document.createElement("div");
  fingerprintContent.style.display = "flex";
  fingerprintContent.style.flexDirection = "column";
  fingerprintContent.style.gap = UI_GAP;

  const buildFingerprintBtn = btn("Build Model Fingerprint Cache");
  buildFingerprintBtn.style.alignSelf = "flex-start";

  fingerprintContent.appendChild(buildFingerprintBtn);
  fingerprintDetails.appendChild(fingerprintContent);

  workflowUtilsContent.appendChild(utilsButtonRow);
  workflowUtilsContent.appendChild(fixerStatus);
  workflowUtilsContent.appendChild(downloadStatus);
  workflowUtilsContent.appendChild(fingerprintDetails);
  workflowUtilsWrap.appendChild(workflowUtilsContent);

  container.appendChild(statusBar);
  container.appendChild(workflowWrap);
  container.appendChild(resolveWrap);
  container.appendChild(divider());
  container.appendChild(modelSection);
  container.appendChild(autoPatchNewWrap);
  container.appendChild(autoSwitchWrap);
  container.appendChild(divider());
  container.appendChild(workflowSaveWrap);
  container.appendChild(workflowUtilsWrap);
  container.appendChild(divider());
  customOutputSection.appendChild(row("Kind", kindSelect));
  customOutputSection.appendChild(row("Media", mediaSelect));
  customOutputSection.appendChild(groupRow("Name", nameStack));
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

  const fixerState = {
    missing: 0,
    fixed: 0,
    total: 0,
    cacheCount: 0,
    cacheUpdatedAt: "",
    cacheError: "",
    scanned: false,
    lastScanToken: -1,
  };

  const downloadState = {
    state: "idle",
    message: "",
    progress: { current: 0, total: 0, pct: 0 },
  };

  const updateFixerStatus = () => {
    const cacheText = fixerState.cacheError
      ? "error"
      : `${fixerState.cacheCount} / ${fixerState.cacheUpdatedAt || "-"}`;
    const missingText = fixerState.scanned ? fixerState.missing : "-";
    const fixedText = fixerState.scanned ? fixerState.fixed : "-";
    fixerStatus.textContent = `Missing: ${missingText} | Fixed: ${fixedText} | Cache: ${cacheText}`;

    const total = fixerState.total || 0;
    let color = "#666666";
    if (fixerState.scanned) {
      if (total > 0 && fixerState.missing === 0) {
        color = "#2f8f4e";
      } else if (total > 0 && fixerState.missing > 0 && fixerState.missing < total) {
        color = "#c77c2a";
      } else if (total > 0 && fixerState.missing >= total) {
        color = "#b33a3a";
      }
    }
    workflowUtilsWrap.style.border = `1px solid ${colorWithAlpha(color, 0.4)}`;
    workflowUtilsWrap.style.background = colorWithAlpha(color, 0.12);
  };

  const updateDownloadStatus = () => {
    const rawState = downloadState.state || "idle";
    const stateLabel = rawState === "queued" ? "downloading" : rawState;
    const pct = downloadState.progress?.pct || 0;
    const pctText = pct ? ` ${pct}%` : "";
    const msg = downloadState.message ? ` | ${downloadState.message}` : "";
    downloadStatusText.textContent = `Download status: ${stateLabel}${pctText}${msg}`;

    let barPct = Math.max(0, Math.min(100, Number(pct) || 0));
    if (rawState === "done" && barPct === 0) {
      barPct = 100;
    }
    if (rawState === "downloading" && barPct === 0 && downloadState.progress?.current) {
      barPct = 5;
    }
    downloadProgressBar.style.width = `${barPct}%`;

    if (rawState === "error") {
      downloadProgressBar.style.background = "rgba(179, 58, 58, 0.7)";
    } else if (rawState === "done") {
      downloadProgressBar.style.background = "rgba(47, 143, 78, 0.7)";
    } else if (rawState === "idle") {
      downloadProgressBar.style.background = "rgba(255, 255, 255, 0.2)";
    } else {
      downloadProgressBar.style.background = "rgba(46, 136, 255, 0.7)";
    }
  };

  const refreshFingerprintStatus = async () => {
    try {
      const resp = await getFingerprintCacheStatus();
      fixerState.cacheCount = Number(resp?.count || 0);
      fixerState.cacheUpdatedAt = String(resp?.updated_at || "");
      fixerState.cacheError = "";
    } catch (e) {
      fixerState.cacheError = "error";
    }
    updateFixerStatus();
  };

  updateFixerStatus();
  updateDownloadStatus();

  const refreshMissingStatus = (force = false) => {
    const autoScan = getSettingBool(SETTING_AUTO_SCAN_MISSING_ON_OPEN, true);
    if (!force && !autoScan) {
      updateFixerStatus();
      return;
    }

    const scanToken = Number(state.graphLoadToken || 0);
    if (!force && fixerState.scanned && fixerState.lastScanToken === scanToken) {
      updateFixerStatus();
      return;
    }

    const stats = scanMissingModelsWithStats();
    fixerState.missing = stats.missing.length;
    fixerState.total = stats.total || 0;
    fixerState.scanned = true;
    fixerState.lastScanToken = scanToken;
    if (fixerState.missing === 0) {
      fixerState.fixed = 0;
    }
    updateFixerStatus();
  };

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

  let existingNamesToken = 0;
  let lastExistingKey = "";

  const refreshExistingNames = async (force = false) => {
    const projectId = state.projectId || "";
    const media = mediaSelect.value || "images";
    const key = `${projectId}::${media}`;
    if (!force && key === lastExistingKey) return;
    lastExistingKey = key;

    existingNamesSelect.innerHTML = "";
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "-- Select existing name --";
    existingNamesSelect.appendChild(emptyOpt);

    if (!projectId) {
      existingNamesSelect.style.display = "none";
      return;
    }

    const requestToken = (existingNamesToken += 1);
    try {
      const names = await listExistingNames(projectId, media);
      if (requestToken !== existingNamesToken) return;
      if (!names.length) {
        existingNamesSelect.style.display = "none";
        return;
      }
      for (const name of names) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        existingNamesSelect.appendChild(opt);
      }
      if (nameInput.value && names.includes(nameInput.value)) {
        existingNamesSelect.value = nameInput.value;
      } else {
        existingNamesSelect.value = "";
      }
      existingNamesSelect.style.display = "block";
    } catch (_) {
      if (requestToken !== existingNamesToken) return;
      existingNamesSelect.style.display = "none";
    }
  };

  let previewToken = 0;

  const updatePreview = async () => {
    const baseRel = state.projectFolder
      ? `PROJECTS/${state.projectFolder}`
      : "PROJECTS/<PROJECT_FOLDER>";
    const modelInfo = resolveModel();
    const tokens = {
      BASE: baseRel,
      MEDIA: mediaDir(mediaSelect.value),
      DATE: yymmddJS(),
      MODEL: String(modelInfo.tag || ""),
      NAME: titlePathJS(nameInput.value || "Name"),
      KIND: makeKindToken(kindSelect.value),
    };
    const template = String(templateInput.value || "").trim();
    const requestToken = (previewToken += 1);

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

    if (!template) {
      previewLabel.textContent = "Preview: -";
      return;
    }

    previewLabel.textContent = "Preview: ...";
    try {
      const resp = await previewTemplate(template, tokens);
      if (requestToken !== previewToken) return;
      const preview = resp?.preview || "";
      previewLabel.textContent = preview ? `Preview: ${preview}` : "Preview: -";
    } catch (err) {
      if (requestToken !== previewToken) return;
      const previewError = String(err?.message || err || "Invalid template");
      previewLabel.textContent = `Preview: ${previewError}`;
    }
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

  // Assign UI helper functions after all are defined
  state._ui = {
    updateStatus,
    updateResolve,
    updatePreview,
    updateWorkflowBlock,
    resetForProjectChange,
    buildWorkflowName,
    setWorkflowName,
    refreshExistingNames,
    refreshProjectsList: (force = false) => refreshProjectsList(force),
    refreshMissingStatus,
  };

  // Store full project list for search filtering
  let allProjects = [];
  let lastProjectsRefreshAt = 0;
  let projectRefreshErrorCount = 0;

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

  refreshProjectsList = async (force = false) => {
    const now = Date.now();

    // Apply exponential backoff on errors
    const throttleMs = projectRefreshErrorCount > 0
      ? PROJECT_REFRESH_ERROR_BACKOFF_MS * Math.min(projectRefreshErrorCount, 5)
      : PROJECT_REFRESH_THROTTLE_MS;

    if (!force && now - lastProjectsRefreshAt < throttleMs) return;

    lastProjectsRefreshAt = now;
    try {
      const resp = await fetchJSON("/mjr_project/list");
      allProjects = resp.projects || [];
      state.lastError = "";
      projectRefreshErrorCount = 0; // Reset error count on success

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
      projectRefreshErrorCount++;
      const errorMsg = String(e.message || e);
      state.lastError = errorMsg;
      updateStatus();

      // Only show toast on first error to avoid spam
      if (projectRefreshErrorCount === 1) {
        toast("error", "Projects list failed", errorMsg);
      }
      console.error("[mjr] Project list refresh failed:", e);
    }
  };

  workflowNameInput.addEventListener("input", updateState);
  workflowAssetInput.addEventListener("input", updateState);
  kindSelect.addEventListener("change", updateState);
  mediaSelect.addEventListener("change", () => {
    updateState();
    refreshExistingNames(true);
  });
  nameInput.addEventListener("input", updateState);
  existingNamesSelect.addEventListener("change", () => {
    nameInput.value = existingNamesSelect.value || "";
    updateState();
  });
  customModelInput.addEventListener("input", updateState);
  useCustomCb.addEventListener("change", updateState);
  autoPatchCb.addEventListener("change", updateState);
  autoPatchNewCb.addEventListener("change", updateState);
  autoSwitchCb.addEventListener("change", updateState);
  autoHookCb.addEventListener("change", updateState);
  templateInput.addEventListener("input", updateState);
  pendingProjectNameInput.addEventListener("input", updateState);
  pendingSelect.addEventListener("change", updateState);

  const runFixMissingModels = async () => {
    debug("[MJR] Fix Missing Models clicked");
    const originalLabel = fixMissingBtn.textContent;
    fixMissingBtn.disabled = true;
    fixMissingBtn.textContent = "Scanning...";
    try {
      debug("[MJR] Scanning for missing models...");
      const stats = scanMissingModelsWithStats();
      debug("[MJR] Scan results:", stats);
      const missing = stats.missing;
      fixerState.missing = missing.length;
      fixerState.total = stats.total || 0;
      fixerState.scanned = true;
      fixerState.lastScanToken = Number(state.graphLoadToken || 0);
      fixerState.fixed = 0;
      updateFixerStatus();

      if (!missing.length) {
        debug("[MJR] No missing models found");
        toast("info", "No missing models", "All model widgets match available options.");
        return;
      }

      const payload = missing.map((item) => ({
        missing_value: item.missing_value,
        type_hint: item.type_hint,
      }));
      debug("[MJR] Sending scan request to API:", payload);
      const resp = await scanModelCandidates(payload);
      debug("[MJR] API response:", resp);
      const results = Array.isArray(resp?.results) ? resp.results : [];
      const resultMap = new Map();
      for (const entry of results) {
        const key = `${String(entry?.missing_value || "")}::${String(entry?.type_hint || "unknown")}`;
        resultMap.set(key, Array.isArray(entry?.candidates) ? entry.candidates : []);
      }

      const autoFixes = [];
      const autoFixedKeys = new Set();
      for (const entry of missing) {
        const key = `${String(entry?.missing_value || "")}::${String(entry?.type_hint || "unknown")}`;
        const candidates = resultMap.get(key) || [];
        const exact = candidates.filter(
          (c) => Number(c?.score || 0) === 100 && !c?.in_wrong_folder && c?.reason !== "wrong_folder"
        );
        if (exact.length === 1) {
          const relpath = String(exact[0]?.relpath || "");
          if (relpath) {
            autoFixes.push({
              node_id: entry?.node_id,
              widget_name: entry?.widget_name,
              new_value: relpath,
            });
            autoFixedKeys.add(`${entry?.node_id ?? ""}::${entry?.widget_name ?? ""}::${entry?.missing_value ?? ""}`);
          }
        }
      }

      let fixedCount = 0;
      let remaining = missing.filter((entry) => {
        const key = `${entry?.node_id ?? ""}::${entry?.widget_name ?? ""}::${entry?.missing_value ?? ""}`;
        return !autoFixedKeys.has(key);
      });

      if (autoFixes.length) {
        fixedCount = applyFixesToGraph(autoFixes);
        const postStats = scanMissingModelsWithStats();
        remaining = postStats.missing;
        fixerState.missing = remaining.length;
        fixerState.total = postStats.total || 0;
        fixerState.scanned = true;
        fixerState.lastScanToken = Number(state.graphLoadToken || 0);
        fixerState.fixed = fixedCount;
        updateFixerStatus();
      }

      if (!remaining.length) {
        if (fixedCount > 0) {
          toast("success", "Fix applied", `Updated ${fixedCount} widget${fixedCount !== 1 ? "s" : ""}.`);
        } else {
          toast("info", "No missing models", "All model widgets match available options.");
        }
        return;
      }

      const fixes = await showModelFixerDialog({
        missing: remaining,
        results,
      });
      debug("[MJR] User selected fixes:", fixes);
      if (!fixes) {
        if (fixedCount > 0) {
          toast("success", "Auto-fix applied", `Updated ${fixedCount} widget${fixedCount !== 1 ? "s" : ""}.`);
        } else {
          toast("info", "Fix cancelled", "No changes applied.");
        }
        return;
      }
      const fixed = applyFixesToGraph(fixes);
      debug("[MJR] Applied fixes count:", fixed);
      const postStats = scanMissingModelsWithStats();
      fixerState.missing = postStats.missing.length;
      fixerState.total = postStats.total || 0;
      fixerState.scanned = true;
      fixerState.lastScanToken = Number(state.graphLoadToken || 0);
      fixerState.fixed = fixedCount + fixed;
      updateFixerStatus();
      if (fixed + fixedCount > 0) {
        toast(
          "success",
          "Fix applied",
          `Updated ${fixed + fixedCount} widget${fixed + fixedCount !== 1 ? "s" : ""}.`
        );
      } else {
        toast("warn", "No changes", "No widgets were updated.");
      }
    } catch (e) {
      console.error("[MJR] Fix missing models error:", e);
      toast("error", "Fix failed", String(e?.message || e));
    } finally {
      fixMissingBtn.textContent = originalLabel;
      fixMissingBtn.disabled = false;
    }
  };

  const uniqueMissingForDownload = (missing) => {
    const seen = new Set();
    const out = [];
    for (const item of missing || []) {
      const key = `${item.missing_value}::${item.type_hint || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const basename = (value) => normalizeKey(value);

  const pollDownloadJob = async (jobId) => {
    while (true) {
      try {
        const status = await getDownloadStatus(jobId);
        downloadState.state = status?.state || "downloading";
        downloadState.message = status?.message || "";
        downloadState.progress = status?.progress || { current: 0, total: 0, pct: 0 };
        updateDownloadStatus();
        if (downloadState.state === "done" || downloadState.state === "error") {
          return status;
        }
      } catch (e) {
        downloadState.state = "error";
        downloadState.message = "status check failed";
        updateDownloadStatus();
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const runDownloadMissingModels = async () => {
    debug("[MJR] Download Missing Models clicked");
    if (downloadState.state === "downloading") {
      debug("[MJR] Download already in progress");
      toast("warn", "Download in progress", "Please wait for the current job to finish.");
      return;
    }
    const originalLabel = downloadMissingBtn.textContent;
    downloadMissingBtn.disabled = true;
    downloadMissingBtn.textContent = "Scanning...";
    downloadState.state = "idle";
    downloadState.message = "scanning";
    updateDownloadStatus();

    try {
      debug("[MJR] Scanning for missing models...");
      const stats = scanMissingModelsWithStats();
      debug("[MJR] Scan results:", stats);
      const missingAll = stats.missing;
      const missing = uniqueMissingForDownload(missingAll);
      debug("[MJR] Unique missing for download:", missing);
      fixerState.missing = missingAll.length;
      fixerState.total = stats.total || 0;
      fixerState.scanned = true;
      fixerState.lastScanToken = Number(state.graphLoadToken || 0);
      updateFixerStatus();
      if (!missing.length) {
        debug("[MJR] No missing models found");
        downloadState.state = "idle";
        downloadState.message = "";
        updateDownloadStatus();
        toast("info", "No missing models", "All model widgets match available options.");
        return;
      }

      const payload = missing.map((item) => ({
        missing_value: item.missing_value,
        type_hint: item.type_hint,
      }));
      const workflowJson = getSerializedWorkflow();
      const noteTexts = extractNoteTexts(workflowJson);
      const noteRecipes = collectNoteRecipes(workflowJson);
      const resolved = await resolveModelRecipes(payload);
      const resolvedMap = new Map();
      for (const entry of resolved?.resolved || []) {
        const key = basename(entry.key || entry.missing_value);
        resolvedMap.set(key, entry);
      }

      const kindOptions = getKindOptions();
      let existingMap = null;
      try {
        const modelResp = await getModels();
        const categories = modelResp?.categories || {};
        existingMap = new Map();
        for (const [kind, items] of Object.entries(categories)) {
          if (!Array.isArray(items)) continue;
          const set = new Set();
          for (const item of items) {
            const raw = String(item || "").replace(/\\/g, "/").toLowerCase();
            if (!raw) continue;
            set.add(raw);
            const base = raw.split("/").pop();
            if (base) set.add(base);
          }
          existingMap.set(kind, set);
        }
      } catch (_) {
        existingMap = null;
      }

      // Helper to check if model exists
      const modelExists = (kind, filename) => {
        if (!existingMap || !kind || !filename) return false;
        const set = existingMap.get(kind);
        if (!set) return false;
        const normalized = String(filename || "").replace(/\\/g, "/").toLowerCase();
        return set.has(normalized) || set.has(normalized.split("/").pop());
      };

      let matches = 0;
      const allEntries = missing.map((item) => {
        const key = basename(item.missing_value);
        const stored = resolvedMap.get(key) || {};
        const fallbackKind = stored.kind || typeHintToKind(item.type_hint);
        const noteRecipe = noteRecipes.get(key);
        let recipe = stored.recipe || null;
        let prefilled = false;
        if (noteRecipe) {
          recipe = noteRecipe;
          if (recipe?.kind === "unknown" && fallbackKind) {
            recipe = { ...recipe, kind: fallbackKind };
          }
          prefilled = true;
          matches += 1;
        } else if (recipe) {
          recipe = { ...recipe, source: "stored" };
          prefilled = true;
        }

        const kind = stored.kind || fallbackKind;
        const filename = recipe?.filename || key;
        const exists = modelExists(kind, filename);

        return {
          missing_value: item.missing_value,
          key,
          kind,
          recipe,
          prefilled,
          exists, // Flag to track if model already downloaded
        };
      });

      // Filter to only show truly missing models (not already downloaded)
      const dialogEntries = allEntries.filter((entry) => !entry.exists);
      const alreadyDownloaded = allEntries.length - dialogEntries.length;
      const entryMap = new Map(dialogEntries.map((entry) => [entry.key, entry]));

      console.debug("[mjr] download filter", {
        total: allEntries.length,
        missing: dialogEntries.length,
        alreadyDownloaded,
        notes: noteTexts.length,
        recipes: noteRecipes.size,
        matches,
      });

      if (dialogEntries.length === 0) {
        downloadState.state = "idle";
        downloadState.message = "";
        updateDownloadStatus();
        if (alreadyDownloaded > 0) {
          toast("success", "All models downloaded", `${alreadyDownloaded} model${alreadyDownloaded !== 1 ? 's' : ''} already in models folder.`);
        } else {
          toast("info", "No downloads needed", "No models to download.");
        }
        return;
      }

      const dialogResult = await showModelDownloaderDialog({
        entries: dialogEntries,
        kindOptions,
        existingMap,
      });
      if (!dialogResult) {
        downloadState.state = "idle";
        downloadState.message = "";
        updateDownloadStatus();
        return;
      }

      const items = dialogResult.items || [];
      if (!items.length) {
        downloadState.state = "idle";
        downloadState.message = "";
        updateDownloadStatus();
        toast("warn", "No downloads", "Select at least one entry to download.");
        return;
      }

      const autoRememberNotes = getSettingBool(SETTING_AUTO_REMEMBER_NOTE_SOURCES, true);
      const saveItems = [];
      if (dialogResult.remember && dialogResult.saveItems?.length) {
        saveItems.push(...dialogResult.saveItems);
      }
      if (autoRememberNotes) {
        for (const item of items) {
          const entry = entryMap.get(item.key);
          if (entry?.recipe?.source === "workflow_note") {
            saveItems.push(item);
          }
        }
      }
      if (saveItems.length) {
        const seenKeys = new Set();
        const deduped = [];
        for (const item of saveItems) {
          if (!item || !item.key) continue;
          if (seenKeys.has(item.key)) continue;
          seenKeys.add(item.key);
          deduped.push(item);
        }
        if (deduped.length) {
          await saveModelRecipes(deduped);
        }
      }

      const resp = await downloadModels(items);
      const jobId = resp?.job_id;
      if (!jobId) {
        throw new Error("download job not created");
      }
      downloadState.state = "downloading";
      downloadState.message = "queued";
      downloadState.progress = { current: 0, total: 0, pct: 0 };
      updateDownloadStatus();

      downloadMissingBtn.textContent = "Downloading...";
      const finalStatus = await pollDownloadJob(jobId);
      const summary = finalStatus?.summary || {};
      const downloaded = Number(summary.downloaded || 0);
      const errors = Number(summary.errors || 0);
      const skipped = Number(summary.skipped || 0);
      if (downloadState.state === "error") {
        toast(
          "error",
          "Download finished",
          `Downloaded ${downloaded}, skipped ${skipped}, errors ${errors}`
        );
      } else {
        toast(
          "success",
          "Download finished",
          `Downloaded ${downloaded}, skipped ${skipped}, errors ${errors}`
        );
      }

      try {
        loadModels();
      } catch (_) {}
      try {
        app.graph?.setDirtyCanvas?.(true, true);
      } catch (_) {}

      const autoFix = getSettingBool(SETTING_AUTO_FIX_AFTER_DOWNLOAD, true);
      if (autoFix) {
        await runFixMissingModels();
      } else {
        const runFix = await psConfirm({
          title: "Run Fix Missing Models?",
          message: "Downloads finished. Run Fix Missing Models now?",
        });
        if (runFix) {
          await runFixMissingModels();
        } else {
          toast("info", "Fix skipped", "Re-open model dropdowns if they do not refresh.");
        }
      }
    } catch (e) {
      downloadState.state = "error";
      downloadState.message = "download failed";
      updateDownloadStatus();
      toast("error", "Download failed", String(e?.message || e));
    } finally {
      downloadMissingBtn.textContent = originalLabel;
      downloadMissingBtn.disabled = false;
    }
  };

  fixMissingBtn.addEventListener("click", runFixMissingModels);
  downloadMissingBtn.addEventListener("click", runDownloadMissingModels);

  buildFingerprintBtn.addEventListener("click", async () => {
    const originalLabel = buildFingerprintBtn.textContent;
    buildFingerprintBtn.disabled = true;
    buildFingerprintBtn.textContent = "Building...";
    try {
      const resp = await buildFingerprintCache({});
      const count = Number(resp?.count || 0);
      fixerState.cacheCount = count;
      fixerState.cacheUpdatedAt = String(resp?.updated_at || "");
      fixerState.cacheError = "";
      updateFixerStatus();
      const hashed = Number(resp?.hashed || 0);
      const reused = Number(resp?.reused || 0);
      toast("success", "Cache built", `Items: ${count} | Hashed: ${hashed} | Reused: ${reused}`);
    } catch (e) {
      toast("error", "Cache build failed", String(e?.message || e));
    } finally {
      buildFingerprintBtn.textContent = originalLabel;
      buildFingerprintBtn.disabled = false;
      refreshFingerprintStatus();
    }
  });

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
        refreshProjectsList(true);
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
      const patchedImages = await patchSaveNodes(app, imgRel, "", "images");
      const patchedVideos = await patchSaveNodes(app, vidRel, "", "videos");
      const patched = patchedImages + patchedVideos;
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
        const patched = await patchSaveNodes(
          app,
          resp.rel_dir,
          resp.filename_prefix,
          resp.media
        );
        if (patched > 0) {
          toast("success", "Patch applied", `Updated ${patched} nodes.`);
        } else {
          toast("warn", "No nodes patched", "No save-like nodes were updated.");
        }
      }
      stampGraphProjectSignature(app, state);
      toast("success", "Folder created", resp.rel_dir);
      refreshProjectsList(true);
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

    const patched = await patchSaveNodes(app, state.lastRelDir, state.lastPrefix, state.media);
    if (patched > 0) {
      toast("success", "Patch applied", `Updated ${patched} node${patched !== 1 ? 's' : ''}.`);
    } else {
      toast("warn", "No nodes patched", "No save-like nodes were updated.");
    }
    stampGraphProjectSignature(app, state);
  });

  loadModels();
  refreshProjectsList(true);
  refreshExistingNames(true);
  updatePreview();
  refreshFingerprintStatus();
  if (getSettingBool(SETTING_AUTO_SCAN_MISSING_ON_OPEN, true)) {
    refreshMissingStatus(true);
  } else {
    updateFixerStatus();
  }
}
