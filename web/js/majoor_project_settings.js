/**
 * Majoor Project Settings — extension entry point.
 *
 * Responsibilities of this file (only wiring):
 *   1. Declare extension settings, commands, menu commands.
 *   2. In setup(): initialise state, register sidebar tab, attach graph listeners.
 *   3. Lifecycle hooks: beforeConfigureGraph, afterConfigureGraph,
 *      beforeQueuePrompt, nodeCreated.
 *
 * All business logic lives in dedicated modules:
 *   - state/store.ts            → reactive state + persistence
 *   - mjr/api.ts                → REST calls
 *   - mjr/ws_events.ts          → WebSocket push events
 *   - mjr/graph.ts              → graph inspection
 *   - mjr/patch.ts              → save-node patching
 *   - mjr/toast.ts              → notifications
 *   - mjr/dialog.ts             → prompts / confirms
 *   - mjr/settings.ts           → extensionManager.setting bridge
 *   - mjr/topbar_badge.ts       → topbar health badge
 *   - ui_components.ts          → panel rendering
 *   - ui/styles.ts              → CSS injection
 */
import { app } from "../../scripts/app.js";
// State
import { getState, setState, initState, loadPersistedState, subscribe, notify, setRuntimeState, saveState, } from "./state/store.js";
// Business logic
import { extractDateFromPath, joinRel, mediaDir, replaceDateInPath, token3Tag, yymmddJS } from "./mjr/utils.js";
import { toast } from "./mjr/toast.js";
import { activateProject, createCustomOut, saveWorkflow, setProject, tryResolveProjectId, listProjects, } from "./mjr/api.js";
import { psConfirm, psPrompt } from "./mjr/dialog.js";
import { detectModelFromGraph, extractGraphOutputMetadata, getSerializedWorkflow, inferProjectFolderFromGraph, readGraphSignature, } from "./mjr/graph.js";
import { PATH_WIDGETS, alreadyProjectPathed, detectNodeMedia, isSaveLikeNode, loadConfig, patchSaveNodes, previewPatchSaveNodes, patchSingleNode, stampGraphProjectSignature, } from "./mjr/patch.js";
import { updateMenuStatusBadge } from "./mjr/topbar_badge.js";
import { scanMissingModelsWithStats } from "./mjr/model_fixer.js";
import { getSettingBool } from "./mjr/settings.js";
import { registerWsEvents } from "./mjr/ws_events.js";
// UI
import { buildPanel } from "./ui_components.js";
import { injectStyles } from "./ui/styles.js";
// ─── Setting IDs ──────────────────────────────────────────────────────────────
const DOWNLOAD_MAX_GB_SETTING = "mjr_project.download_max_gb";
const AUTO_FIX_AFTER_DOWNLOAD_SETTING = "mjr_project.auto_fix_after_download";
const AUTO_OPEN_PANEL_ON_MISSING_SETTING = "mjr_project.auto_open_panel_on_missing";
const AUTO_SCAN_MISSING_ON_OPEN_SETTING = "mjr_project.auto_scan_missing_on_open";
const PROMPT_EMPTY_GRAPH_SETTING = "mjr_project.prompt_empty_graph";
const AUTO_REMEMBER_NOTE_SOURCES_SETTING = "mjr_project.auto_remember_note_sources";
const NO_PROJECT_STATUS_BLACK_SETTING = "mjr_project.status_black_no_project";
const LEGACY_CTRL_S_HOOK_SETTING = "mjr_project.legacy_ctrl_s_hook";
const TOAST_VERBOSE_SETTING = "mjr_project.toast_verbose";
const AUTO_PATCH_NEW_NODES_SETTING = "mjr_project.auto_patch_new_nodes";
const AUTO_SWITCH_TRUSTED_SETTING = "mjr_project.auto_switch_trusted";
const AUTO_HOOK_SAVE_SETTING = "mjr_project.auto_hook_save";
const AUTO_PATCH_SETTING = "mjr_project.auto_patch";
const SETTINGS_CATEGORY = ["MajoorPS"];
const CATEGORY_NOTIFICATIONS = ["MajoorPS", "Notifications"];
const CATEGORY_PROJECTS = ["MajoorPS", "Projects & Workflows"];
const CATEGORY_MODELS = ["MajoorPS", "Models & Downloads"];
// Command IDs
const COMMAND_SAVE_WORKFLOW_TO_PROJECT = "mjr.projectSettings.saveWorkflowToProject";
const COMMAND_OPEN_PANEL = "mjr.projectSettings.openPanel";
const COMMAND_ASSIGN_ACTIVE_PROJECT = "mjr.projectSettings.assignActiveProject";
const COMMAND_SCAN_MISSING_MODELS = "mjr.projectSettings.scanMissingModels";
const COMMAND_PATCH_SAVE_NODES = "mjr.projectSettings.patchSaveNodes";
// Misc constants
const NODE_PATCH_RETRY_DELAY_MS = 60;
const NODE_PATCH_MAX_RETRIES = 1;
let _workflowShortcutRegistered = false;
// ─── Date rolling ─────────────────────────────────────────────────────────────
function _rollOutputDateIfNeeded(state, patchCanvas = false) {
    if (!state)
        return false;
    const today = yymmddJS();
    const prefixExt = extractDateFromPath(state.lastPrefix);
    const relDirExt = extractDateFromPath(state.lastRelDir);
    const oldDate = prefixExt?.yymmdd || relDirExt?.yymmdd;
    if (!oldDate || oldDate === today)
        return false;
    let changed = false;
    if (state.lastRelDir) {
        const rolled = replaceDateInPath(state.lastRelDir, today);
        if (rolled !== state.lastRelDir) {
            state.lastRelDir = rolled;
            changed = true;
        }
    }
    if (state.lastPrefix) {
        const rolled = replaceDateInPath(state.lastPrefix, today);
        if (rolled !== state.lastPrefix) {
            state.lastPrefix = rolled;
            changed = true;
        }
    }
    if (changed) {
        saveState(state);
        notify();
        if (patchCanvas || state.autoPatch !== false) {
            void patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media).catch(() => { });
        }
    }
    return changed;
}
// ─── Path adaptation ──────────────────────────────────────────────────────────
function _adaptPathsToProject(state, newFolder) {
    if (!newFolder)
        return;
    if ((state.lastRelDir || "").includes("PROJECTS/")) {
        state.lastRelDir = (state.lastRelDir || "").replace(/PROJECTS\/[^/]+/i, `PROJECTS/${newFolder}`);
    }
    if ((state.lastPrefix || "").includes("PROJECTS/")) {
        state.lastPrefix = (state.lastPrefix || "").replace(/PROJECTS\/[^/]+/i, `PROJECTS/${newFolder}`);
    }
}
// ─── Project activation ───────────────────────────────────────────────────────
export async function setActiveProjectById(state, projectId, token, { skipFreshPaths = false } = {}) {
    const resp = await listProjects();
    let list = resp.projects || [];
    let entry = list.find((p) => p.project_id === projectId);
    // If not found in memory index, attempt to resolve from disk and refresh list
    if (!entry) {
        try {
            const resolvedId = await tryResolveProjectId(projectId);
            if (resolvedId) {
                const refreshed = await listProjects();
                list = refreshed.projects || [];
                entry = list.find((p) => p.project_id === resolvedId);
            }
        }
        catch (_) { }
    }
    if (!entry)
        throw new Error("project not found");
    if (token != null && state?.graphLoadToken !== token)
        return null;
    // Sync active project state with backend (updates last_used and current.json)
    void activateProject(entry.project_id).catch(() => { });
    state.projectId = entry.project_id;
    state.projectFolder = entry.folder || "";
    state.projectExists = entry.exists !== false;
    state.lastError = "";
    _rollOutputDateIfNeeded(state);
    // Clear detected conflict if active project now matches
    if (state.detected) {
        const detId = state.detected.project_id;
        const detFolder = (state.detected.project_folder || "").toLowerCase();
        if (detId === entry.project_id || (entry.folder && detFolder === entry.folder.toLowerCase())) {
            state.detected = null;
        }
    }
    if (state.autoPatch !== false) {
        let pathsComputed = false;
        if (!skipFreshPaths) {
            try {
                const preview = await createCustomOut({
                    project_id: String(entry.project_id || ""),
                    kind: state.kind || "asset",
                    name: state.name || "Asset",
                    media: state.media || "images",
                    model: state.modelSelection || state.detectedModelTag || "Unknown",
                    model_upper: state.modelUpper || false,
                    date: yymmddJS(),
                    template: state.pathTemplate || "",
                });
                if (preview?.rel_dir) {
                    state.lastRelDir = String(preview.rel_dir);
                    state.lastPrefix = String(preview.prefix || "");
                    pathsComputed = true;
                }
            }
            catch (_) { }
        }
        if (!pathsComputed)
            _adaptPathsToProject(state, String(entry.folder || ""));
        if (state.lastRelDir || state.lastPrefix) {
            await patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media).catch(() => { });
        }
    }
    // Stamp graph with active project signature
    stampGraphProjectSignature(app, state);
    saveState(state);
    notify();
    state._ui?.resetForProjectChange?.();
    toast("success", "Project active", entry.folder || entry.project_id);
    return entry;
}
// ─── Project creation ─────────────────────────────────────────────────────────
export async function createAndActivateProject(state, projectName, _updateCallbacks) {
    const resp = await setProject(projectName, true);
    state.projectName = projectName;
    state.projectId = resp.project_id;
    state.projectFolder = resp.project_folder;
    state.projectExists = true;
    state.lastError = "";
    state.workflowHasSignature = true;
    state.detected = null; // Clear any conflicting detection
    // Adapt paths to newly created project folder
    _adaptPathsToProject(state, resp.project_folder);
    if (state.autoPatch !== false) {
        try {
            const preview = await createCustomOut({
                project_id: String(resp.project_id || ""),
                kind: state.kind || "asset",
                name: state.name || "Asset",
                media: state.media || "images",
                model: state.modelSelection || state.detectedModelTag || "Unknown",
                model_upper: state.modelUpper || false,
                date: yymmddJS(),
                template: state.pathTemplate || "",
            });
            if (preview?.rel_dir) {
                state.lastRelDir = String(preview.rel_dir);
                state.lastPrefix = String(preview.prefix || "");
            }
        }
        catch (_) { }
        if (state.lastRelDir || state.lastPrefix) {
            await patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media).catch(() => { });
        }
    }
    saveState(state);
    notify();
    stampGraphProjectSignature(app, state);
    state._ui?.resetForProjectChange?.();
    toast("success", "Project created", resp.project_folder);
    return resp;
}
// ─── Workflow save ────────────────────────────────────────────────────────────
export async function saveWorkflowToProject(state, nameOverride) {
    if (!state?.projectId) {
        toast("error", "No active project", "Set a project before saving workflows.");
        return;
    }
    const workflow = getSerializedWorkflow();
    if (!workflow) {
        toast("error", "Workflow not available", "Could not serialize the current graph.");
        return;
    }
    let workflowName = (nameOverride ?? state.workflowName ?? "").trim();
    if (!workflowName) {
        const suggestion = state._ui?.buildWorkflowName?.() ?? "";
        const entered = await psPrompt({ title: "Workflow name", message: "Enter a workflow name base", defaultValue: suggestion });
        if (entered === null) {
            toast("info", "Workflow save cancelled", "No name provided.");
            return;
        }
        workflowName = String(entered || "").trim();
        if (!workflowName) {
            toast("error", "Validation", "Workflow name is required.");
            return;
        }
        state._ui?.setWorkflowName?.(workflowName);
    }
    try {
        stampGraphProjectSignature(app, state);
        const resp = await saveWorkflow({
            project_id: state.projectId,
            workflow_name: workflowName,
            workflow,
            overwrite: false,
            mirror_to_comfy_workflows: true,
            use_project_subfolder_in_workflows: true,
            asset_folder: (state.workflowAsset || "").trim(),
        });
        state.workflowHasSignature = true;
        state.workflowChecked = true;
        state.lastError = "";
        const fileBase = String(resp.file || "").replace(/\.json$/i, "");
        const suffixMatch = fileBase.match(/_(\d{4})$/);
        if (suffixMatch) {
            const base = fileBase.slice(0, -5);
            state.workflowLastBase = base;
            state.workflowNextSuffix = Number(suffixMatch[1]) + 1;
            state._ui?.setWorkflowName?.(base);
        }
        saveState(state);
        notify();
        toast("success", "Workflow saved", `${resp.file || "workflow.json"} -> ${resp.project_rel_path || "PROJECTS/<PROJECT>/03_WORKFLOWS"}`);
        if (!resp.mirrored)
            toast("warn", "Workflow mirror", resp.mirror_error || "Mirror disabled or unavailable.");
    }
    catch (e) {
        state.lastError = e instanceof Error ? e.message : String(e);
        notify();
        toast("error", "Workflow save failed", state.lastError);
    }
}
// ─── Graph detection ──────────────────────────────────────────────────────────
async function _onGraphLoadedDetectProject(state, token) {
    if (!state)
        return;
    await loadConfig();
    const runToken = typeof token === "number" ? token : state.graphLoadToken || 0;
    const isStale = () => state.graphLoadToken !== runToken;
    const graphNodes = app?.graph?._nodes;
    const graphEmpty = !Array.isArray(graphNodes) || graphNodes.length === 0;
    const guardToast = (type, title, message) => {
        if (!isStale() && !graphEmpty)
            toast(type, title, message);
    };
    if (isStale())
        return;
    let workflowHasSignature = false;
    const workflowChecked = true;
    let pendingProjectName = state.pendingProjectName || "";
    let pendingSelectProjectId = state.pendingSelectProjectId || "";
    let detected = { mode: "none", project_folder: "", project_id: "", confidence: 0 };
    let detectedModelTag = state.detectedModelTag || "";
    let lastError = "";
    const outputMeta = !graphEmpty ? extractGraphOutputMetadata(isSaveLikeNode) : null;
    if (!graphEmpty) {
        const sig = readGraphSignature();
        if (sig && (sig.project_id || sig.project_folder)) {
            detected = { mode: "signature", project_id: String(sig.project_id || ""), project_folder: String(sig.project_folder || ""), confidence: 100 };
            workflowHasSignature = true;
            guardToast("info", "Project detected", `Workflow signature: ${detected.project_folder || detected.project_id}`);
        }
        else {
            const folder = inferProjectFolderFromGraph(isSaveLikeNode) || outputMeta?.projectFolder || "";
            if (folder) {
                detected = { mode: "path", project_folder: folder, project_id: "", confidence: 60 };
                guardToast("info", "Project inferred", `From save paths: ${folder}`);
            }
            else {
                guardToast("warn", "No project detected", "This workflow has no PROJECTS paths or signature.");
            }
            guardToast("warn", "Workflow unassigned", "Assign or create a project for this workflow.");
        }
    }
    if (!workflowHasSignature) {
        if (detected.project_folder)
            pendingProjectName = detected.project_folder;
        pendingSelectProjectId = "";
    }
    if (!detected.project_id && detected.project_folder) {
        detected.project_id = await tryResolveProjectId(detected.project_folder);
        if (isStale())
            return;
    }
    const activeId = state.projectId || "";
    const detectedId = detected.project_id || "";
    const hasActive = !!activeId;
    const conflict = hasActive && detectedId && activeId !== detectedId;
    const shouldAutoSwitch = (detected.mode === "signature" || detected.mode === "path") &&
        detectedId && state.autoSwitchTrusted && (!hasActive || conflict);
    if (shouldAutoSwitch) {
        if (isStale())
            return;
        try {
            if (outputMeta) {
                if (outputMeta.name)
                    state.name = outputMeta.name;
                if (outputMeta.kind)
                    state.kind = outputMeta.kind;
                if (outputMeta.media)
                    state.media = outputMeta.media;
                if (outputMeta.relDir)
                    state.lastRelDir = outputMeta.relDir;
                if (outputMeta.prefix)
                    state.lastPrefix = outputMeta.prefix;
            }
            const entry = await setActiveProjectById(state, detectedId, runToken, { skipFreshPaths: true });
            if (isStale() || !entry)
                return;
            detected = { mode: "none", project_folder: "", project_id: "", confidence: 0 };
        }
        catch (e) {
            if (isStale())
                return;
            lastError = e instanceof Error ? e.message : String(e);
            guardToast("error", "Auto-switch failed", lastError);
        }
    }
    else if (conflict) {
        guardToast("warn", "Project mismatch", `Workflow: ${detected.project_folder || detected.project_id}`);
    }
    if (outputMeta && (!hasActive || !conflict || shouldAutoSwitch)) {
        if (outputMeta.name)
            state.name = outputMeta.name;
        if (outputMeta.kind)
            state.kind = outputMeta.kind;
        if (outputMeta.media)
            state.media = outputMeta.media;
        if (outputMeta.relDir)
            state.lastRelDir = outputMeta.relDir;
        if (outputMeta.prefix)
            state.lastPrefix = outputMeta.prefix;
    }
    if (!graphEmpty) {
        const modelTag = detectModelFromGraph(token3Tag) || "";
        if (modelTag !== state.detectedModelTag) {
            detectedModelTag = modelTag;
            if (modelTag)
                guardToast("info", "Model detected", modelTag);
        }
    }
    if (isStale())
        return;
    state.workflowHasSignature = workflowHasSignature;
    state.workflowChecked = workflowChecked;
    state.pendingProjectName = pendingProjectName;
    state.pendingSelectProjectId = pendingSelectProjectId;
    state.detected = detected;
    state.workflowPanelOpen = graphEmpty ? false : !workflowHasSignature;
    state.detectedModelTag = detectedModelTag;
    if (lastError)
        state.lastError = lastError;
    saveState(state);
    notify();
}
// ─── Graph empty state ────────────────────────────────────────────────────────
const _isGraphEmpty = () => {
    const nodes = app?.graph?._nodes;
    return !Array.isArray(nodes) || nodes.length === 0;
};
function _handleGraphEmptyTransition(state, runToken, currentEmpty) {
    if (!state)
        return false;
    const wasEmpty = Boolean(state.graphIsEmpty);
    if (wasEmpty === currentEmpty) {
        if (!currentEmpty)
            state._emptyGraphPromptToken = null;
        return false;
    }
    state.graphIsEmpty = currentEmpty;
    if (!currentEmpty) {
        state._emptyGraphPromptToken = null;
    }
    else if (getSettingBool(PROMPT_EMPTY_GRAPH_SETTING, false)) {
        void _promptEmptyGraphProject(state, runToken ?? state.graphLoadToken);
    }
    return true;
}
async function _promptEmptyGraphProject(state, runToken) {
    if (!state || state.projectId)
        return;
    if (state._emptyGraphPromptToken === runToken)
        return;
    state._emptyGraphPromptToken = runToken;
    const confirmCreate = await psConfirm({ title: "Empty workflow", message: "This workflow is empty. Create a new project now?\nCancel to set an existing project." });
    if (state.graphLoadToken !== runToken)
        return;
    if (confirmCreate) {
        const entered = await psPrompt({ title: "Project name", message: "Enter a project name", defaultValue: state.pendingProjectName || "" });
        if (state.graphLoadToken !== runToken)
            return;
        if (entered === null)
            return;
        const projectName = String(entered || "").trim();
        if (!projectName)
            return;
        await createAndActivateProject(state, projectName, {});
        return;
    }
    state.workflowPanelOpen = true;
    saveState(state);
    notify();
}
// ─── Graph event listeners ────────────────────────────────────────────────────
function _attachGraphEventListeners(state) {
    if (!state)
        return;
    const checkEmpty = () => {
        const empty = _isGraphEmpty();
        if (_handleGraphEmptyTransition(state, state.graphLoadToken, empty)) {
            saveState(state);
            notify();
        }
    };
    checkEmpty();
    const graph = app?.graph;
    if (!graph || graph.__mjr_listeners_attached)
        return;
    graph.__mjr_listeners_attached = true;
    let _modelCheckTimeout = null;
    const debouncedCheckModel = () => {
        if (_modelCheckTimeout)
            clearTimeout(_modelCheckTimeout);
        _modelCheckTimeout = setTimeout(() => {
            try {
                if (!state || state.isGraphLoading)
                    return;
                const tag = detectModelFromGraph(token3Tag) || "";
                if (tag && tag !== state.detectedModelTag) {
                    state.detectedModelTag = tag;
                    saveState(state);
                    notify();
                }
            }
            catch (_) { }
        }, 150);
    };
    const origOnNodeAdded = graph.onNodeAdded;
    graph.onNodeAdded = function (...args) {
        const res = origOnNodeAdded?.apply(this, args);
        checkEmpty();
        debouncedCheckModel();
        return res;
    };
    const origOnNodeRemoved = graph.onNodeRemoved;
    graph.onNodeRemoved = function (...args) {
        const res = origOnNodeRemoved?.apply(this, args);
        checkEmpty();
        debouncedCheckModel();
        return res;
    };
}
// ─── Keyboard shortcut ────────────────────────────────────────────────────────
function _registerWorkflowShortcut() {
    if (_workflowShortcutRegistered)
        return;
    if (!getSettingBool(LEGACY_CTRL_S_HOOK_SETTING, false))
        return;
    _workflowShortcutRegistered = true;
    window.addEventListener("keydown", (event) => {
        if ((!event.ctrlKey && !event.metaKey) || String(event.key).toLowerCase() !== "s")
            return;
        const state = getState();
        if (!state || state.autoHookSave === false || !state.projectId)
            return;
        if (event.cancelable)
            event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void saveWorkflowToProject(state);
    }, true);
}
// ─── Command functions ────────────────────────────────────────────────────────
function _saveActiveWorkflowToProjectCommand() {
    const state = getState();
    if (!state?.projectId) {
        toast("warn", "Project Settings", "No active project.");
        return;
    }
    void saveWorkflowToProject(state);
}
function _openProjectSettingsCommand() {
    const sidebar = app?.extensionManager?.sidebar;
    if (sidebar?.setTab) {
        sidebar.setTab("mjr_project_settings");
        return;
    }
    const state = getState();
    if (state) {
        state.workflowPanelOpen = true;
        saveState(state);
        notify();
    }
}
function _assignActiveProjectCommand() {
    const state = getState();
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
    notify();
    toast("success", "Workflow assigned", state.projectFolder);
}
function _scanMissingModelsCommand() {
    const state = getState();
    if (!state)
        return;
    try {
        const { missing } = scanMissingModelsWithStats();
        state._ui?.refreshMissingStatus?.();
        toast(missing?.length ? "warn" : "success", "Missing Models", `${missing?.length || 0} missing model${missing?.length === 1 ? "" : "s"} detected`, { life: 4000 });
    }
    catch (_) {
        toast("error", "Missing Models", "Scan failed.");
    }
}
async function _patchSaveNodesCommand() {
    const state = getState();
    if (!state?.projectId) {
        toast("warn", "Patch skipped", "Set a project first.");
        return;
    }
    _rollOutputDateIfNeeded(state);
    let relDir = state.lastRelDir;
    const prefix = state.lastPrefix || "";
    if (!relDir && state.projectFolder)
        relDir = joinRel(`PROJECTS/${state.projectFolder}`, mediaDir(state.media || "images"));
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
    const previewLines = preview.slice(0, 8).map((item) => `${item.nodeLabel}.${item.widget}: ${item.oldValue || "-"} -> ${item.newValue || "-"}`);
    const overflow = preview.length > previewLines.length ? `\n...and ${preview.length - previewLines.length} more change(s)` : "";
    const confirmed = await psConfirm({ title: "Patch save paths?", message: `Update ${nodeCount} save node${nodeCount === 1 ? "" : "s"} to use the project path?\n\n${previewLines.join("\n")}${overflow}\n\nThis can be undone with Ctrl+Z.` });
    if (!confirmed) {
        toast("info", "Patch cancelled", "No nodes were modified.");
        return;
    }
    const patched = await patchSaveNodes(app, relDir, prefix, state.media);
    toast(patched ? "success" : "warn", patched ? "Patch applied" : "No nodes patched", patched ? `Updated ${patched} node${patched === 1 ? "" : "s"}.` : "No save-like nodes were updated.");
}
// ─── Settings declarations ────────────────────────────────────────────────────
const EXTENSION_SETTINGS = [
    { id: TOAST_VERBOSE_SETTING, name: "Verbose toast notifications", type: "boolean", defaultValue: false, category: CATEGORY_NOTIFICATIONS, tooltip: "When disabled, non-critical informational toasts are silenced.",
        onChange: (v) => { try {
            localStorage.setItem("mjr_project_toast_verbose", v ? "true" : "false");
        }
        catch (_) { } } },
    { id: AUTO_PATCH_NEW_NODES_SETTING, name: "Auto-patch newly added save nodes", type: "boolean", defaultValue: true, category: CATEGORY_PROJECTS, tooltip: "Automatically set the project output directory and prefix whenever new save-like nodes are added.",
        onChange: (v) => { const s = getState(); if (s) {
            s.autoPatchNewNodes = v;
            saveState(s);
        } } },
    { id: AUTO_SWITCH_TRUSTED_SETTING, name: "Auto-switch to signed project", type: "boolean", defaultValue: true, category: CATEGORY_PROJECTS, tooltip: "Automatically switch the active project when opening a workflow that carries a Majoor project signature.",
        onChange: (v) => { const s = getState(); if (s) {
            s.autoSwitchTrusted = v;
            saveState(s);
        } } },
    { id: AUTO_PATCH_SETTING, name: "Auto-patch on output create", type: "boolean", defaultValue: true, category: CATEGORY_PROJECTS, tooltip: "Automatically patch existing save nodes when a new output target directory is created.",
        onChange: (v) => { const s = getState(); if (s) {
            s.autoPatch = v;
            saveState(s);
        } } },
    { id: AUTO_HOOK_SAVE_SETTING, name: "Auto-hook Ctrl+S to project save", type: "boolean", defaultValue: true, category: CATEGORY_PROJECTS, tooltip: "Intercept Ctrl+S / Cmd+S to auto-save workflow into the active project's 03_WORKFLOWS folder.",
        onChange: (v) => { const s = getState(); if (s) {
            s.autoHookSave = v;
            saveState(s);
        } } },
    { id: PROMPT_EMPTY_GRAPH_SETTING, name: "Prompt on empty workflow", type: "boolean", defaultValue: false, category: CATEGORY_PROJECTS, tooltip: "Prompt user to select or create a project when an empty workflow is loaded." },
    { id: NO_PROJECT_STATUS_BLACK_SETTING, name: "Black status when no project", type: "boolean", defaultValue: false, category: CATEGORY_PROJECTS, tooltip: "Render topbar status badge in black when no project is currently active.",
        onChange: () => { const s = getState(); if (s)
            updateMenuStatusBadge(s); } },
    { id: LEGACY_CTRL_S_HOOK_SETTING, name: "Legacy Ctrl+S hook", type: "boolean", defaultValue: false, category: CATEGORY_PROJECTS, tooltip: "Use legacy global key listener instead of modern ComfyUI command system for Ctrl+S." },
    { id: AUTO_SCAN_MISSING_ON_OPEN_SETTING, name: "Auto-scan missing on panel open", type: "boolean", defaultValue: true, category: CATEGORY_MODELS, tooltip: "Automatically scan the workflow for missing models whenever the panel is opened." },
    { id: AUTO_OPEN_PANEL_ON_MISSING_SETTING, name: "Auto-open panel on missing models", type: "boolean", defaultValue: false, category: CATEGORY_MODELS, tooltip: "Automatically open the Majoor sidebar panel if missing models are detected when loading a workflow." },
    { id: AUTO_FIX_AFTER_DOWNLOAD_SETTING, name: "Auto-run Fix after download", type: "boolean", defaultValue: true, category: CATEGORY_MODELS, tooltip: "Automatically prompt or execute Fix Missing Models on graph widgets after download completes." },
    { id: AUTO_REMEMBER_NOTE_SOURCES_SETTING, name: "Auto-remember note sources", type: "boolean", defaultValue: true, category: CATEGORY_MODELS, tooltip: "Automatically store model URLs discovered in workflow markdown/note nodes for future use." },
    { id: DOWNLOAD_MAX_GB_SETTING, name: "Download max size (GB)", type: "number", defaultValue: 50, min: 1, max: 1024, step: 1, category: CATEGORY_MODELS, tooltip: "Maximum model download size in Gigabytes before rejecting as too large." },
];
// ─── Extension registration ───────────────────────────────────────────────────
app.registerExtension({
    name: "Majoor.ProjectSettings",
    settings: EXTENSION_SETTINGS,
    commands: [
        { id: COMMAND_SAVE_WORKFLOW_TO_PROJECT, label: "MajoorPS: Save workflow to project", function: _saveActiveWorkflowToProjectCommand },
        { id: COMMAND_OPEN_PANEL, label: "MajoorPS: Open Project Settings", function: _openProjectSettingsCommand },
        { id: COMMAND_ASSIGN_ACTIVE_PROJECT, label: "MajoorPS: Assign workflow to active project", function: _assignActiveProjectCommand },
        { id: COMMAND_SCAN_MISSING_MODELS, label: "MajoorPS: Scan missing models", function: _scanMissingModelsCommand },
        { id: COMMAND_PATCH_SAVE_NODES, label: "MajoorPS: Patch save nodes now", function: _patchSaveNodesCommand },
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
        // Inject CSS once
        injectStyles();
        // Load + init state
        await loadConfig();
        const persisted = loadPersistedState();
        const state = initState(persisted || {});
        // State migrations (keep for compat)
        if (!state.kind)
            state.kind = "asset";
        if (state.media === "asset") {
            state.kind = "asset";
            state.media = "images";
        }
        if (state.media === "shot") {
            state.kind = "shot";
            state.media = "videos";
        }
        if (state.customModel && !state.customModelText)
            state.customModelText = state.customModel;
        if (state.modelSelection === "__custom__")
            state.modelSelection = "";
        if (state.pathTemplate === "{BASE}/{MEDIA}/{DATE}/{MODEL}/{NAME}")
            state.pathTemplate = "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";
        if (state.useCustomModel == null)
            state.useCustomModel = false;
        if (state.autoHookSave == null)
            state.autoHookSave = true;
        if (!state.workflowLastBase)
            state.workflowLastBase = "";
        const nextSuffix = Number(state.workflowNextSuffix);
        state.workflowNextSuffix = (!nextSuffix || nextSuffix < 1) ? 1 : Math.floor(nextSuffix);
        if (state.modelUpper == null)
            state.modelUpper = state.useCustomModel === true;
        if (!state.detectedModelTag)
            state.detectedModelTag = "";
        if (!Number.isFinite(state.graphLoadToken))
            state.graphLoadToken = 0;
        // Sync settings into state
        state.autoPatchNewNodes = getSettingBool(AUTO_PATCH_NEW_NODES_SETTING, state.autoPatchNewNodes !== false);
        state.autoSwitchTrusted = getSettingBool(AUTO_SWITCH_TRUSTED_SETTING, state.autoSwitchTrusted !== false);
        state.autoHookSave = getSettingBool(AUTO_HOOK_SAVE_SETTING, state.autoHookSave !== false);
        state.autoPatch = getSettingBool(AUTO_PATCH_SETTING, state.autoPatch !== false);
        // Activate legacy compat shim
        setRuntimeState(state);
        _rollOutputDateIfNeeded(state);
        updateMenuStatusBadge(state);
        _registerWorkflowShortcut();
        state._emptyGraphPromptToken = null;
        // Subscribe topbar badge to state changes
        subscribe(() => updateMenuStatusBadge(getState()));
        // Activate WebSocket events (download progress, scan results)
        registerWsEvents();
        // Panel render function
        const renderPanel = (el) => {
            el.classList.add("mjr-ps-root");
            const options = {
                createAndActivateProject,
                setActiveProjectById,
                saveWorkflowToProject,
            };
            return buildPanel(el, state, options);
        };
        // Register sidebar tab
        const canSidebar = !!app?.extensionManager?.registerSidebarTab;
        if (canSidebar) {
            app.extensionManager.registerSidebarTab({
                id: "mjr_project_settings",
                icon: "pi pi-briefcase",
                title: "Project",
                tooltip: "Majoor Project Settings",
                type: "custom",
                render: (el) => renderPanel(el),
            });
        }
        else {
            // Fallback: floating panel for very old ComfyUI versions
            const box = document.createElement("div");
            box.style.cssText = "position:fixed;top:64px;right:16px;z-index:9999;background:rgba(20,20,20,0.9);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:10px;width:280px";
            document.body.appendChild(box);
            renderPanel(box);
        }
        _attachGraphEventListeners(state);
    },
    async beforeConfigureGraph() {
        const state = getState();
        if (state) {
            setState({ isGraphLoading: true, graphLoadToken: (state.graphLoadToken || 0) + 1 });
        }
    },
    async afterConfigureGraph() {
        const state = getState();
        if (state) {
            setState({ isGraphLoading: false });
            _attachGraphEventListeners(state);
            void _onGraphLoadedDetectProject(state, state.graphLoadToken);
            _rollOutputDateIfNeeded(state);
            if (getSettingBool(AUTO_SCAN_MISSING_ON_OPEN_SETTING, true)) {
                const scanToken = state.graphLoadToken;
                setTimeout(() => {
                    const s = getState();
                    if (!s || s.graphLoadToken !== scanToken)
                        return;
                    try {
                        const { missing } = scanMissingModelsWithStats();
                        s._ui?.refreshMissingStatus?.();
                        if (missing && missing.length > 0) {
                            toast("warn", "Missing Models", `${missing.length} missing model${missing.length !== 1 ? "s" : ""} detected in workflow`, { life: 4000 });
                            if (getSettingBool(AUTO_OPEN_PANEL_ON_MISSING_SETTING, false)) {
                                s.activeTab = "model";
                                saveState(s);
                                notify();
                                const sidebar = app?.extensionManager?.sidebar;
                                if (sidebar?.setTab) {
                                    setTimeout(() => sidebar.setTab("mjr_project_settings"), 100);
                                }
                            }
                        }
                    }
                    catch (_) { }
                }, 0);
            }
        }
    },
    async beforeQueuePrompt() {
        const state = getState();
        if (!state)
            return;
        const activeId = state.projectId;
        const detectedId = state.detected?.project_id;
        const activeFolder = state.projectFolder;
        const detectedFolder = state.detected?.project_folder;
        const hasConflict = (detectedId && activeId && detectedId !== activeId) ||
            (detectedFolder && activeFolder && detectedFolder.toLowerCase() !== activeFolder.toLowerCase());
        if (hasConflict) {
            const sig = readGraphSignature();
            const currentGraphFolder = inferProjectFolderFromGraph(isSaveLikeNode);
            const isSignatureAligned = sig?.project_id === activeId || (activeFolder && sig?.project_folder?.toLowerCase() === activeFolder.toLowerCase());
            const isPathAligned = Boolean(currentGraphFolder && activeFolder && currentGraphFolder.toLowerCase() === activeFolder.toLowerCase());
            if (isSignatureAligned || isPathAligned) {
                state.detected = null;
                saveState(state);
            }
            else {
                const msg = `Workflow belongs to project '${detectedFolder || detectedId}', but active project is '${activeFolder || activeId}'.`;
                toast("error", "Project Conflict", `${msg} Execution blocked to protect output paths. Switch project first.`, { life: 6000 });
                throw new Error(`[Majoor] Execution blocked: ${msg}`);
            }
        }
        _rollOutputDateIfNeeded(state);
        if (state.projectId && (state.lastRelDir || state.lastPrefix)) {
            await patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media).catch(() => { });
        }
        stampGraphProjectSignature(app, state);
    },
    async nodeCreated(node) {
        const state = getState();
        if (!state || state.isGraphLoading)
            return;
        if (state.graphIsEmpty) {
            if (_handleGraphEmptyTransition(state, state.graphLoadToken, false)) {
                saveState(state);
                notify();
            }
        }
        await loadConfig();
        if (!state.projectId || !state.autoPatchNewNodes)
            return;
        if (!state.projectFolder || state.projectExists === false)
            return;
        if (!isSaveLikeNode(node))
            return;
        let warnedPathed = false;
        let timeoutId = null;
        const attemptPatch = (retriesLeft) => {
            const nodeStillExists = app.graph?._nodes?.includes(node);
            if (!nodeStillExists) {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                return;
            }
            if (!state.projectId || !state.autoPatchNewNodes)
                return;
            if (!state.projectFolder || state.projectExists === false)
                return;
            if (state.isGraphLoading)
                return;
            const widgets = node?.widgets || [];
            const filenameWidget = widgets.find((w) => {
                const name = String(w?.name || "").toLowerCase();
                return (name === "filename_prefix" ||
                    name === "filename" ||
                    name === "file_prefix" ||
                    name === "prefix" ||
                    name === "output_filename" ||
                    name === "filename_format");
            });
            const pathWidget = widgets.find((w) => w?.name && PATH_WIDGETS.includes(String(w.name).toLowerCase()));
            if (!filenameWidget && !pathWidget) {
                if (retriesLeft > 0)
                    timeoutId = setTimeout(() => attemptPatch(retriesLeft - 1), NODE_PATCH_RETRY_DELAY_MS);
                return;
            }
            if ((filenameWidget && alreadyProjectPathed(filenameWidget.value)) || (pathWidget && alreadyProjectPathed(pathWidget.value))) {
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
            if (relDir) {
                // Adapt media subfolder if node media differs from state configured media
                const configuredMedia = state.media || "images";
                if (nm !== configuredMedia) {
                    relDir = relDir.replace(new RegExp(`02_OUT/${configuredMedia === "videos" ? "VIDEOS" : "IMAGES"}`, "i"), `02_OUT/${nm === "videos" ? "VIDEOS" : "IMAGES"}`);
                }
            }
            else {
                relDir = joinRel(`PROJECTS/${state.projectFolder}`, mediaDir(nm));
            }
            if (patchSingleNode(node, relDir, prefix)) {
                try {
                    app.graph.setDirtyCanvas(true, true);
                }
                catch (_) { }
                toast("success", "Auto-patch", "New save node patched.", { life: 2000 });
            }
            else if (retriesLeft > 0) {
                timeoutId = setTimeout(() => attemptPatch(retriesLeft - 1), NODE_PATCH_RETRY_DELAY_MS);
            }
        };
        attemptPatch(NODE_PATCH_MAX_RETRIES);
    },
});
//# sourceMappingURL=majoor_project_settings.js.map