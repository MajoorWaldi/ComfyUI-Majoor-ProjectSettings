/**
 * Project Tab component for Majoor Project Settings.
 * Manages project health, project creation/activation, output targets, and safe patching.
 */
import { app } from "../../../../scripts/app.js";
import { extractDateFromPath, makeKindToken, mediaDir, replaceDateInPath, resolveModel, titlePathJS, yymmddJS, } from "../../mjr/utils.js";
import { toast, isToastVerbose, setToastVerbose } from "../../mjr/toast.js";
import { fetchJSON, listExistingNames, previewTemplate } from "../../mjr/api.js";
import { psConfirm } from "../../mjr/dialog.js";
import { setSettingValue } from "../../mjr/settings.js";
import { inspectSaveNodesPatchStatus, patchSaveNodes, stampGraphProjectSignature, } from "../../mjr/patch.js";
import { saveState } from "../../state_manager.js";
import { createCard, createButton, createInput, createSelect, createRow, createSwitch, createDetails, createSegmentedControl, createStatusTile, THEME, } from "../theme.js";
import { renderProjectDropdowns } from "../project_dropdowns.js";
import { PROJECT_REFRESH_ERROR_BACKOFF_MS, PROJECT_REFRESH_THROTTLE_MS, TEMPLATE_TOKENS, } from "../panel_constants.js";
function extractNameFromRelDir(relDir, projectFolder) {
    if (!relDir)
        return "";
    const parts = relDir.replace(/\\/g, "/").split("/").filter(Boolean);
    if (parts.length === 0)
        return "";
    const ignorable = new Set([
        "projects",
        "02_out",
        "00_meta",
        "01_work",
        "images",
        "videos",
        "img",
        "vid",
        "asset",
        "shot",
        "misc",
    ]);
    if (projectFolder) {
        ignorable.add(projectFolder.toLowerCase());
    }
    const candidates = parts.filter((p) => !ignorable.has(p.toLowerCase()) && !/^\d{6,8}$/.test(p));
    if (candidates.length >= 2) {
        return candidates[candidates.length - 2];
    }
    if (candidates.length === 1) {
        return candidates[0];
    }
    return parts[parts.length - 1];
}
export function buildProjectTab(ctx) {
    const { state, actions, updateUI, updateStatus, fixerState } = ctx;
    const { createAndActivateProject, setActiveProjectById } = actions;
    let cachedPatchSummary = null;
    let cacheKey = "";
    const getPatchSummary = () => {
        const currentKey = `${state.lastRelDir || ""}|${state.lastPrefix || ""}|${state.media || ""}`;
        if (cachedPatchSummary !== null && cacheKey === currentKey) {
            return cachedPatchSummary;
        }
        cachedPatchSummary = state.lastRelDir || state.lastPrefix
            ? inspectSaveNodesPatchStatus(app, state.lastRelDir, state.lastPrefix, state.media)
            : { total: 0, synced: 0, toUpdate: 0, items: [] };
        cacheKey = currentKey;
        return cachedPatchSummary;
    };
    const invalidatePatchCache = () => {
        cachedPatchSummary = null;
    };
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = THEME.gap;
    // -------------------------------------------------------------
    // 1. Health Status: Modern 4-Tile Minimal Dashboard
    // -------------------------------------------------------------
    const healthCard = createCard("Project Overview");
    const healthGrid = document.createElement("div");
    healthGrid.style.display = "grid";
    healthGrid.style.gridTemplateColumns = "1fr 1fr";
    healthGrid.style.gap = "6px";
    healthGrid.style.marginTop = "4px";
    const tileFolder = createStatusTile("Project", "None", "pi pi-folder");
    const tileTarget = createStatusTile("Output Target", "Not configured", "pi pi-crosshair");
    const tilePatch = createStatusTile("Save Nodes", "0 save nodes", "pi pi-wrench");
    const tileModels = createStatusTile("Models", "Not scanned", "pi pi-box");
    healthGrid.appendChild(tileFolder.element);
    healthGrid.appendChild(tileTarget.element);
    healthGrid.appendChild(tilePatch.element);
    healthGrid.appendChild(tileModels.element);
    healthCard.appendChild(healthGrid);
    const updateHealth = () => {
        if (projectSelect) {
            if (state.projectId && projectSelect.value !== state.projectId) {
                projectSelect.value = state.projectId;
            }
            else if (!state.projectId && projectSelect.value !== "") {
                projectSelect.value = "";
            }
        }
        // 1. Project folder
        if (!state.projectId) {
            tileFolder.update("No active project", THEME.textMuted);
        }
        else if (state.projectExists === false) {
            tileFolder.update("Missing on disk", THEME.accentError, state.projectFolder || state.projectId);
        }
        else {
            tileFolder.update(state.projectFolder || state.projectId, THEME.accentSuccess);
        }
        // 2. Output target
        if (state.lastRelDir || state.lastPrefix) {
            const typeLabel = (state.kind || "asset").toUpperCase();
            const targetName = state.name || extractNameFromRelDir(state.lastRelDir, state.projectFolder) || "Ready";
            tileTarget.update(`[${typeLabel}] ${targetName}`, THEME.accentSuccess, state.lastRelDir || "");
        }
        else {
            tileTarget.update("Not set", THEME.accentWarning);
        }
        // 3. Patch nodes
        const summary = getPatchSummary();
        if (summary.total === 0) {
            tilePatch.update("0 save nodes", THEME.textMuted);
        }
        else if (summary.toUpdate === 0) {
            tilePatch.update(`${summary.synced} synced`, THEME.accentSuccess, `${summary.total} save node(s) up to date`);
        }
        else {
            tilePatch.update(`${summary.toUpdate} to update`, THEME.accentWarning, `${summary.synced}/${summary.total} synced`);
        }
        // 4. Models
        if (!fixerState.scanned) {
            tileModels.update("Not scanned", THEME.textMuted);
        }
        else if (fixerState.missing === 0) {
            tileModels.update("All present", THEME.accentSuccess);
        }
        else {
            tileModels.update(`${fixerState.missing} missing`, THEME.accentWarning);
        }
    };
    // -------------------------------------------------------------
    // 2. Project Detection Conflict Resolver Banner
    // -------------------------------------------------------------
    const resolveWrap = createCard("Workflow Mismatch", "Action Required", THEME.accentWarning);
    resolveWrap.style.display = "none";
    resolveWrap.style.borderColor = THEME.accentWarning;
    const resolveInfo = document.createElement("div");
    resolveInfo.style.fontSize = "11px";
    resolveInfo.style.color = THEME.textColor;
    const resolveActive = document.createElement("div");
    resolveActive.style.fontSize = "11px";
    resolveActive.style.color = THEME.textMuted;
    const resolveBtns = document.createElement("div");
    resolveBtns.style.display = "flex";
    resolveBtns.style.gap = "6px";
    resolveBtns.style.flexWrap = "wrap";
    resolveBtns.style.marginTop = "4px";
    const switchBtn = createButton("Switch to detected", "primary");
    const assignBtn = createButton("Assign to active", "secondary");
    const createBtn = createButton("New project", "secondary");
    const dismissBtn = createButton("Dismiss", "ghost");
    resolveBtns.appendChild(switchBtn);
    resolveBtns.appendChild(assignBtn);
    resolveBtns.appendChild(createBtn);
    resolveBtns.appendChild(dismissBtn);
    resolveWrap.appendChild(resolveInfo);
    resolveWrap.appendChild(resolveActive);
    resolveWrap.appendChild(resolveBtns);
    const updateResolve = () => {
        const det = state.detected;
        let show = true;
        if (!det || det.mode === "none")
            show = false;
        const sameProject = det &&
            det.mode !== "none" &&
            ((det.project_id && det.project_id === state.projectId) ||
                (det.project_folder && det.project_folder === state.projectFolder));
        if (sameProject)
            show = false;
        if (!show) {
            resolveWrap.style.display = "none";
            return;
        }
        const mode = det.mode || "none";
        const wfFolder = det.project_folder || "none";
        resolveInfo.textContent = `Workflow project: ${wfFolder} (${mode})`;
        resolveActive.textContent = `Active project: ${state.projectFolder || "none"}`;
        resolveWrap.style.display = "flex";
        const canSwitch = mode !== "none" && (det.project_id || det.project_folder);
        switchBtn.disabled = !canSwitch;
        assignBtn.disabled = !state.projectId;
    };
    switchBtn.addEventListener("click", async () => {
        const det = state.detected;
        if (!det?.project_id && !det?.project_folder)
            return;
        try {
            if (det.project_id) {
                await setActiveProjectById(state, det.project_id);
            }
            else {
                const resp = await fetchJSON(`/mjr_project/resolve?folder=${encodeURIComponent(det.project_folder)}`);
                if (resp.ok && resp.project_id) {
                    await setActiveProjectById(state, resp.project_id);
                }
            }
            state.detected = null;
            saveState(state);
            updateUI();
        }
        catch (e) {
            toast("error", "Switch failed", String(e));
        }
    });
    assignBtn.addEventListener("click", () => {
        if (!state.projectId)
            return;
        stampGraphProjectSignature(app, state);
        state.workflowHasSignature = true;
        state.workflowChecked = true;
        state.detected = null;
        saveState(state);
        updateUI();
        toast("success", "Assigned", "Workflow assigned to active project.");
    });
    dismissBtn.addEventListener("click", () => {
        state.detected = null;
        saveState(state);
        updateResolve();
    });
    // -------------------------------------------------------------
    // 3. Unified Active Project Card
    // -------------------------------------------------------------
    const projectCard = createCard("Active Project");
    // Project selector row with "+ New" button inline
    const projectSelectRow = document.createElement("div");
    projectSelectRow.style.display = "flex";
    projectSelectRow.style.gap = "6px";
    projectSelectRow.style.alignItems = "center";
    const projectSelect = createSelect([{ value: "", label: "Select project..." }]);
    projectSelect.style.flex = "1";
    const newProjectToggleBtn = createButton("New", "secondary", "pi pi-plus");
    newProjectToggleBtn.title = "Create new project";
    projectSelectRow.appendChild(projectSelect);
    projectSelectRow.appendChild(newProjectToggleBtn);
    // Inline creation drawer (hidden by default)
    const inlineCreateDrawer = document.createElement("div");
    inlineCreateDrawer.style.display = "none";
    inlineCreateDrawer.style.flexDirection = "column";
    inlineCreateDrawer.style.gap = "6px";
    inlineCreateDrawer.style.padding = "8px";
    inlineCreateDrawer.style.borderRadius = THEME.radiusSm;
    inlineCreateDrawer.style.background = "rgba(255, 255, 255, 0.03)";
    inlineCreateDrawer.style.border = `1px solid ${THEME.borderColor}`;
    const projectNameInput = createInput("New project name (e.g. 260327_Character_VFX)", "");
    const createActionRow = document.createElement("div");
    createActionRow.style.display = "flex";
    createActionRow.style.gap = "6px";
    const confirmCreateBtn = createButton("Create & Activate", "primary", "pi pi-check");
    confirmCreateBtn.style.flex = "1";
    const cancelCreateBtn = createButton("Cancel", "ghost");
    createActionRow.appendChild(confirmCreateBtn);
    createActionRow.appendChild(cancelCreateBtn);
    inlineCreateDrawer.appendChild(projectNameInput);
    inlineCreateDrawer.appendChild(createActionRow);
    newProjectToggleBtn.addEventListener("click", () => {
        const isVisible = inlineCreateDrawer.style.display === "flex";
        inlineCreateDrawer.style.display = isVisible ? "none" : "flex";
        if (!isVisible) {
            projectNameInput.focus();
        }
    });
    cancelCreateBtn.addEventListener("click", () => {
        inlineCreateDrawer.style.display = "none";
        projectNameInput.value = "";
    });
    confirmCreateBtn.addEventListener("click", async () => {
        const name = projectNameInput.value.trim();
        if (!name) {
            toast("error", "Validation", "Project name is required.");
            return;
        }
        confirmCreateBtn.disabled = true;
        try {
            await createAndActivateProject(state, name, {
                updateStatus,
                updateResolve,
                updateWorkflowBlock: () => updateHealth(),
                resetForProjectChange,
                updatePreview,
                refreshProjectsList,
            });
            projectNameInput.value = "";
            inlineCreateDrawer.style.display = "none";
            toast("success", "Project Created", `Active project set to ${name}`);
        }
        catch (e) {
            toast("error", "Create failed", String(e));
        }
        finally {
            confirmCreateBtn.disabled = false;
        }
    });
    // Fast direct switch on dropdown change
    projectSelect.addEventListener("change", async () => {
        const selectedId = projectSelect.value;
        if (!selectedId || selectedId === state.projectId)
            return;
        try {
            await setActiveProjectById(state, selectedId);
            updateHealth();
            updateResolve();
            updateTargetLabel();
            updateUI();
            toast("info", "Project Switched", `Active project: ${state.projectFolder || selectedId}`);
        }
        catch (e) {
            toast("error", "Activation failed", String(e));
            // Revert selection to current
            projectSelect.value = state.projectId || "";
        }
    });
    projectCard.appendChild(createRow("Project Selection", projectSelectRow));
    projectCard.appendChild(inlineCreateDrawer);
    const autoPatchSwitch = createSwitch("Auto-patch new save nodes", state.autoPatchNewNodes !== false, (checked) => {
        state.autoPatchNewNodes = checked;
        saveState(state);
        setSettingValue("mjr_project.auto_patch_new_nodes", checked);
    });
    const autoSwitchSwitch = createSwitch("Auto-switch on trusted signature", state.autoSwitchTrusted === true, (checked) => {
        state.autoSwitchTrusted = checked;
        saveState(state);
        setSettingValue("mjr_project.auto_switch_trusted", checked);
    });
    const verboseToastSwitch = createSwitch("Verbose notifications (Toasts)", isToastVerbose(), (checked) => {
        setToastVerbose(checked);
        toast("info", "Notifications", checked ? "Verbose notifications enabled (all toasts displayed)." : "Verbose notifications disabled (routine info muted).", { force: true });
    });
    projectCard.appendChild(autoPatchSwitch);
    projectCard.appendChild(autoSwitchSwitch);
    projectCard.appendChild(verboseToastSwitch);
    let cachedProjects = [];
    let isFetchingProjects = false;
    let lastProjectsFetchTime = 0;
    let projectsFetchBackoffUntil = 0;
    const refreshProjectsList = (force = false) => {
        const now = Date.now();
        if (now < projectsFetchBackoffUntil && !force)
            return;
        if (isFetchingProjects)
            return;
        if (!force && now - lastProjectsFetchTime < PROJECT_REFRESH_THROTTLE_MS)
            return;
        isFetchingProjects = true;
        lastProjectsFetchTime = now;
        fetchJSON("/mjr_project/list")
            .then((resp) => {
            cachedProjects = resp.projects || [];
            renderProjectDropdowns({ pendingSelect: projectSelect }, cachedProjects);
            if (state.pendingSelectProjectId) {
                projectSelect.value = state.pendingSelectProjectId;
            }
            else if (state.projectId) {
                projectSelect.value = state.projectId;
            }
        })
            .catch((err) => {
            projectsFetchBackoffUntil = Date.now() + PROJECT_REFRESH_ERROR_BACKOFF_MS;
            console.warn("[mjr] Failed to load projects list:", err);
        })
            .finally(() => {
            isFetchingProjects = false;
        });
    };
    // -------------------------------------------------------------
    // 4. Custom Output Target & Auto-Patch Section
    // -------------------------------------------------------------
    const outputSection = createDetails("Output Target & Save Patching", true);
    // Segmented control for Kind (Asset vs Shot)
    const kindControl = createSegmentedControl([
        { value: "asset", label: "Asset", icon: "pi pi-tag" },
        { value: "shot", label: "Shot", icon: "pi pi-video" },
    ], state.kind || "asset", (val) => {
        state.kind = val;
        updateNameKindUI();
        saveState(state);
        refreshExistingNames();
        void updatePreview();
    });
    // Segmented control for Media (Images vs Videos)
    const mediaControl = createSegmentedControl([
        { value: "images", label: "Images", icon: "pi pi-image" },
        { value: "videos", label: "Videos", icon: "pi pi-camera" },
    ], state.media || "images", (val) => {
        state.media = val;
        saveState(state);
        refreshExistingNames();
        void updatePreview();
    });
    const getNameLabelText = () => (state.kind === "shot" ? "Shot Name" : "Asset Name");
    const getNamePlaceholder = () => state.kind === "shot"
        ? "Shot name (e.g. shot_010 / scene_intro)"
        : "Asset name (e.g. hero_render / prop_sword)";
    const nameInput = createInput(getNamePlaceholder(), state.name || "");
    const nameRow = createRow(getNameLabelText(), nameInput);
    const updateNameKindUI = () => {
        const labelSpan = nameRow.querySelector("span");
        if (labelSpan) {
            labelSpan.textContent = getNameLabelText();
        }
        nameInput.placeholder = getNamePlaceholder();
    };
    // Interactive pill chips container for existing names
    const existingNamesPills = document.createElement("div");
    existingNamesPills.style.display = "none";
    existingNamesPills.style.flexWrap = "wrap";
    existingNamesPills.style.gap = "4px";
    existingNamesPills.style.marginTop = "2px";
    const autoPatchOutputsSwitch = createSwitch("Auto-patch outputs on creation", state.autoPatch !== false, (checked) => {
        state.autoPatch = checked;
        saveState(state);
    });
    const createApplyBtn = createButton("Apply to Save Nodes", "primary", "pi pi-bolt");
    createApplyBtn.style.flex = "1";
    createApplyBtn.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.15) 100%)";
    createApplyBtn.style.borderColor = "rgba(52, 211, 153, 0.45)";
    createApplyBtn.style.color = "#d1fae5";
    createApplyBtn.style.boxShadow = "0 1px 4px rgba(16, 185, 129, 0.2)";
    const patchNowBtn = createButton("Patch Now", "secondary", "pi pi-wrench");
    const targetLabel = document.createElement("div");
    targetLabel.style.fontSize = "11px";
    targetLabel.style.color = THEME.textMuted;
    targetLabel.style.lineHeight = "1.4";
    targetLabel.style.padding = "6px 10px";
    targetLabel.style.background = "rgba(0, 0, 0, 0.32)";
    targetLabel.style.borderRadius = THEME.radiusSm;
    targetLabel.style.border = `1px solid ${THEME.borderColor}`;
    targetLabel.style.borderLeft = "3px solid #4ade80";
    targetLabel.style.boxSizing = "border-box";
    const updateTargetLabel = () => {
        targetLabel.innerHTML = "";
        if (state.lastRelDir) {
            const infoText = document.createElement("div");
            infoText.style.display = "flex";
            infoText.style.flexDirection = "column";
            infoText.style.gap = "3px";
            const dirRow = document.createElement("div");
            dirRow.style.wordBreak = "break-all";
            dirRow.innerHTML = `<span style="color: ${THEME.textMuted}; font-size: 10px;">TARGET:</span> <span style="font-family: monospace; color: #ffffff; font-weight: 500;">${state.lastRelDir}</span>`;
            infoText.appendChild(dirRow);
            const prefixRow = document.createElement("div");
            prefixRow.style.wordBreak = "break-all";
            prefixRow.innerHTML = `<span style="color: ${THEME.textMuted}; font-size: 10px;">PREFIX:</span> <code style="color: ${THEME.accentSuccess}; font-size: 11px;">${state.lastPrefix || "-"}</code>`;
            infoText.appendChild(prefixRow);
            const typeRow = document.createElement("div");
            typeRow.innerHTML = `<span style="color: ${THEME.textMuted}; font-size: 10px;">TYPE:</span> <span style="color: ${THEME.accentSuccess}; font-weight: 600; font-size: 11px;">[${(state.kind || "asset").toUpperCase()}]</span> <span style="color: ${THEME.textMuted}; font-size: 10px; margin-left: 8px;">MEDIA:</span> <span style="color: #ffffff; font-weight: 500; font-size: 11px;">${(state.media || "images").toUpperCase()}</span>`;
            infoText.appendChild(typeRow);
            const modelInfo = resolveModel(state);
            const modelRow = document.createElement("div");
            modelRow.innerHTML = `<span style="color: ${THEME.textMuted}; font-size: 10px;">MODEL TAG:</span> <span style="color: ${THEME.primaryColor}; font-weight: 600;">[${modelInfo.tag || "Default"}]</span> <span style="font-size: 10px; color: ${THEME.textDim};">${modelInfo.isCustom ? "(custom)" : "(detected)"}</span>`;
            infoText.appendChild(modelRow);
            targetLabel.appendChild(infoText);
            // Check patchable nodes count to dynamically update button text
            const summary = getPatchSummary();
            if (summary.toUpdate > 0) {
                createApplyBtn.textContent = `Apply to Save Nodes (${summary.toUpdate} to update)`;
                patchNowBtn.textContent = `Patch (${summary.toUpdate})`;
            }
            else if (summary.total > 0) {
                createApplyBtn.textContent = "Re-apply to Save Nodes";
                patchNowBtn.textContent = `All Synced (${summary.total})`;
            }
            else {
                createApplyBtn.textContent = "Apply to Save Nodes";
                patchNowBtn.textContent = "Patch Now";
            }
            // Check date roll need
            const today = yymmddJS();
            const prefixDate = extractDateFromPath(state.lastPrefix);
            const relDirDate = extractDateFromPath(state.lastRelDir);
            const activeDate = prefixDate?.yymmdd || relDirDate?.yymmdd;
            if (activeDate && activeDate !== today) {
                const rollNotice = document.createElement("div");
                rollNotice.style.marginTop = "6px";
                rollNotice.style.padding = "4px 8px";
                rollNotice.style.background = "rgba(245, 158, 11, 0.12)";
                rollNotice.style.border = `1px solid rgba(245, 158, 11, 0.3)`;
                rollNotice.style.borderRadius = THEME.radiusSm;
                rollNotice.style.display = "flex";
                rollNotice.style.alignItems = "center";
                rollNotice.style.justifyContent = "space-between";
                rollNotice.style.gap = "6px";
                const rollText = document.createElement("span");
                rollText.style.color = THEME.accentWarning;
                rollText.style.fontSize = "10px";
                rollText.textContent = `Date is ${activeDate} (Today: ${today})`;
                rollNotice.appendChild(rollText);
                const rollBtn = createButton("Roll to Today", "primary", "pi pi-calendar-plus");
                rollBtn.style.padding = "2px 6px";
                rollBtn.style.fontSize = "9px";
                rollBtn.addEventListener("click", async () => {
                    if (state.lastRelDir)
                        state.lastRelDir = replaceDateInPath(state.lastRelDir, today);
                    if (state.lastPrefix)
                        state.lastPrefix = replaceDateInPath(state.lastPrefix, today);
                    saveState(state);
                    updateTargetLabel();
                    updateHealth();
                    if (state.autoPatch !== false) {
                        const patched = await patchSaveNodes(app, state.lastRelDir, state.lastPrefix || "", state.media);
                        toast("success", "Date Rolled", `Rolled to ${today}. ${patched} save node(s) patched.`);
                    }
                    else {
                        toast("success", "Date Rolled", `Updated to ${today}`);
                    }
                });
                rollNotice.appendChild(rollBtn);
                targetLabel.appendChild(rollNotice);
            }
            targetLabel.style.display = "block";
        }
        else {
            targetLabel.textContent = "No target configured";
            targetLabel.style.display = "none";
            createApplyBtn.textContent = "Create Target + Apply";
        }
    };
    const refreshExistingNames = () => {
        if (!state.projectId)
            return;
        listExistingNames(state.projectId, state.media || "images")
            .then((names) => {
            const list = Array.isArray(names) ? names : [];
            existingNamesPills.innerHTML = "";
            if (list.length > 0) {
                existingNamesPills.style.display = "flex";
                for (const n of list.slice(0, 8)) {
                    const pill = document.createElement("button");
                    pill.type = "button";
                    pill.className = "mjr-ps-btn";
                    pill.textContent = n;
                    pill.style.padding = "2px 6px";
                    pill.style.fontSize = "10px";
                    pill.style.borderRadius = "3px";
                    pill.style.border = `1px solid ${THEME.borderColor}`;
                    pill.style.background = "rgba(255, 255, 255, 0.04)";
                    pill.style.color = THEME.textMuted;
                    pill.style.cursor = "pointer";
                    pill.addEventListener("click", () => {
                        nameInput.value = n;
                        state.name = n;
                        saveState(state);
                        void updatePreview();
                    });
                    existingNamesPills.appendChild(pill);
                }
            }
            else {
                existingNamesPills.style.display = "none";
            }
        })
            .catch(() => {
            existingNamesPills.style.display = "none";
        });
    };
    let nameDebounceTimer = null;
    nameInput.addEventListener("input", () => {
        state.name = nameInput.value;
        saveState(state);
        if (nameDebounceTimer)
            clearTimeout(nameDebounceTimer);
        nameDebounceTimer = setTimeout(() => {
            void updatePreview();
        }, 300);
    });
    const resetForProjectChange = () => {
        if (projectSelect) {
            if (state.projectId && projectSelect.value !== state.projectId) {
                projectSelect.value = state.projectId;
            }
            else if (!state.projectId && projectSelect.value !== "") {
                projectSelect.value = "";
            }
        }
        updateNameKindUI();
        invalidatePatchCache();
        refreshExistingNames();
        updateHealth();
        updateResolve();
        updateTargetLabel();
        void updatePreview();
    };
    const updatePreview = async () => {
        if (!state.projectId)
            return;
        const base = state.projectFolder ? `PROJECTS/${state.projectFolder}` : "";
        if (!base)
            return;
        const modelInfo = resolveModel(state);
        const tpl = state.pathTemplate || "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}";
        const tokens = {
            BASE: base,
            MEDIA: mediaDir(state.media || "images"),
            DATE: yymmddJS(),
            NAME: titlePathJS(state.name || "Asset"),
            KIND: makeKindToken(state.kind || "asset"),
            MODEL: modelInfo.tag || "Default",
        };
        try {
            const resp = await previewTemplate(tpl, tokens);
            if (resp.ok && resp.preview) {
                state.lastRelDir = String(resp.preview);
                const prefix = resp.prefix || resp.filename_prefix;
                state.lastPrefix = prefix || `${yymmddJS()}_${titlePathJS(state.name || "Asset")}_`;
                invalidatePatchCache();
                updateTargetLabel();
                updateHealth();
            }
        }
        catch (_) {
            // preview error non-fatal
        }
    };
    createApplyBtn.addEventListener("click", async () => {
        if (!state.projectId) {
            toast("error", "No Project", "Activate a project first.");
            return;
        }
        const name = nameInput.value.trim();
        if (!name) {
            toast("error", "Validation", "Asset or shot name is required.");
            return;
        }
        createApplyBtn.disabled = true;
        try {
            const modelInfo = resolveModel(state);
            const resp = await fetchJSON("/mjr_project/create_custom_out", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    project_id: state.projectId,
                    kind: state.kind || "asset",
                    name: name,
                    media: state.media || "images",
                    model: modelInfo.modelRaw || "Default",
                    model_upper: modelInfo.modelUpper,
                    template: state.pathTemplate || "",
                }),
            });
            const prefix = resp.prefix || resp.filename_prefix || "";
            state.lastRelDir = resp.rel_dir;
            state.lastPrefix = prefix;
            invalidatePatchCache();
            saveState(state);
            updateTargetLabel();
            updateHealth();
            if (state.autoPatch !== false) {
                const patched = await patchSaveNodes(app, resp.rel_dir, prefix, state.media);
                invalidatePatchCache();
                toast("success", "Target Ready", `Created target. ${patched} save node(s) patched.`);
            }
            else {
                toast("success", "Target Ready", resp.rel_dir);
            }
            refreshExistingNames();
        }
        catch (e) {
            toast("error", "Failed", String(e));
        }
        finally {
            createApplyBtn.disabled = false;
        }
    });
    patchNowBtn.addEventListener("click", async () => {
        if (!state.projectId) {
            toast("warn", "Patch skipped", "Set a project first.");
            return;
        }
        const relDir = state.lastRelDir;
        const prefix = state.lastPrefix || "";
        if (!relDir) {
            toast("warn", "Patch skipped", "Create an output target first.");
            return;
        }
        const patched = await patchSaveNodes(app, relDir, prefix, state.media);
        invalidatePatchCache();
        toast(patched ? "success" : "warn", patched ? "Patch applied" : "No nodes patched", patched ? `Updated ${patched} node(s).` : "No save-like nodes found.");
        updateHealth();
    });
    const outActionRow = document.createElement("div");
    outActionRow.style.display = "flex";
    outActionRow.style.gap = "6px";
    outActionRow.appendChild(createApplyBtn);
    outActionRow.appendChild(patchNowBtn);
    outputSection.appendChild(createRow("Output Type", kindControl.element));
    outputSection.appendChild(createRow("Media Format", mediaControl.element));
    outputSection.appendChild(nameRow);
    outputSection.appendChild(existingNamesPills);
    outputSection.appendChild(autoPatchOutputsSwitch);
    outputSection.appendChild(outActionRow);
    outputSection.appendChild(targetLabel);
    // -------------------------------------------------------------
    // 5. Advanced Settings Section (Collapsible)
    // -------------------------------------------------------------
    const advancedSection = createDetails("Advanced Project Settings", false);
    const templateInput = createInput("Path template", state.pathTemplate || "{BASE}/{MEDIA}/{DATE}/{NAME}/{MODEL}");
    templateInput.addEventListener("change", () => {
        state.pathTemplate = templateInput.value;
        saveState(state);
        void updatePreview();
    });
    const tokenBtnRow = document.createElement("div");
    tokenBtnRow.style.display = "flex";
    tokenBtnRow.style.flexWrap = "wrap";
    tokenBtnRow.style.gap = "4px";
    for (const token of TEMPLATE_TOKENS) {
        const tBtn = createButton(token, "ghost");
        tBtn.style.padding = "3px 6px";
        tBtn.style.fontSize = "10px";
        tBtn.addEventListener("click", () => {
            templateInput.value = `${templateInput.value}/${token}`.replace(/\/+/g, "/");
            state.pathTemplate = templateInput.value;
            saveState(state);
            void updatePreview();
        });
        tokenBtnRow.appendChild(tBtn);
    }
    const archiveProjectBtn = createButton("Archive Current Project", "secondary", "pi pi-inbox");
    const deleteProjectBtn = createButton("Remove from Index", "danger", "pi pi-trash");
    archiveProjectBtn.addEventListener("click", async () => {
        if (!state.projectId)
            return;
        const ok = await psConfirm({
            title: "Archive Project?",
            message: `Archive '${state.projectFolder || state.projectId}'? Files remain on disk.`,
        });
        if (!ok)
            return;
        try {
            await fetchJSON("/mjr_project/archive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: state.projectId }),
            });
            state.projectId = "";
            state.projectFolder = "";
            state.lastRelDir = "";
            state.lastPrefix = "";
            saveState(state);
            updateUI();
            refreshProjectsList(true);
            toast("info", "Archived", "Project hidden from active lists.");
        }
        catch (e) {
            toast("error", "Archive failed", String(e));
        }
    });
    deleteProjectBtn.addEventListener("click", async () => {
        if (!state.projectId)
            return;
        const ok = await psConfirm({
            title: "Remove Project from Index?",
            message: `Remove '${state.projectFolder || state.projectId}' from the index? (Files on disk will NOT be deleted).`,
        });
        if (!ok)
            return;
        try {
            await fetchJSON("/mjr_project/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: state.projectId, confirm: true }),
            });
            state.projectId = "";
            state.projectFolder = "";
            state.lastRelDir = "";
            state.lastPrefix = "";
            saveState(state);
            updateUI();
            refreshProjectsList(true);
            toast("info", "Removed", "Project removed from index.");
        }
        catch (e) {
            toast("error", "Remove failed", String(e));
        }
    });
    const dangerousRow = document.createElement("div");
    dangerousRow.style.display = "flex";
    dangerousRow.style.gap = "6px";
    dangerousRow.appendChild(archiveProjectBtn);
    dangerousRow.appendChild(deleteProjectBtn);
    advancedSection.appendChild(createRow("Path Template", templateInput));
    advancedSection.appendChild(tokenBtnRow);
    advancedSection.appendChild(dangerousRow);
    // Assemble Tab
    container.appendChild(healthCard);
    container.appendChild(resolveWrap);
    container.appendChild(projectCard);
    container.appendChild(outputSection);
    container.appendChild(advancedSection);
    // Initial population
    updateTargetLabel();
    refreshProjectsList();
    return {
        element: container,
        updateHealth,
        updateResolve,
        updateWorkflowBlock: () => {
            updateHealth();
            updateResolve();
            refreshProjectsList();
        },
        refreshProjectsList,
        resetForProjectChange,
        updatePreview,
        updateTargetLabel,
        refreshExistingNames,
    };
}
//# sourceMappingURL=project_tab.js.map