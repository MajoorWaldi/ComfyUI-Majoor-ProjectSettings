/**
 * Workflow Tab component for Majoor Project Settings.
 * Manages project-aware workflow saves, versioned suffixes, signature stamping,
 * and mirroring to ComfyUI's user workflows directory.
 */
import { app } from "../../../../scripts/app.js";
import { toast } from "../../mjr/toast.js";
import { stampGraphProjectSignature } from "../../mjr/patch.js";
import { setSettingValue } from "../../mjr/settings.js";
import { saveState } from "../../state_manager.js";
import { createCard, createButton, createInput, createRow, createSwitch, THEME, } from "../theme.js";
export function buildWorkflowTab(ctx) {
    const { state, actions, updateUI, updateHealth } = ctx;
    const { saveWorkflowToProject } = actions;
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = THEME.gap;
    // -------------------------------------------------------------
    // 1. Project Workflow Save Card (Primary Focus)
    // -------------------------------------------------------------
    const saveCard = createCard("Save Workflow to Project");
    // Version banner showing next version
    const versionRow = document.createElement("div");
    versionRow.style.display = "flex";
    versionRow.style.alignItems = "center";
    versionRow.style.justifyContent = "space-between";
    versionRow.style.padding = "6px 8px";
    versionRow.style.borderRadius = THEME.radiusSm;
    versionRow.style.background = "rgba(255, 255, 255, 0.03)";
    versionRow.style.border = `1px solid ${THEME.borderColor}`;
    const versionLabel = document.createElement("span");
    versionLabel.style.fontSize = "11px";
    versionLabel.style.fontWeight = "500";
    versionLabel.style.color = THEME.textMuted;
    versionLabel.textContent = "Next Version:";
    const versionBadge = document.createElement("span");
    versionBadge.style.fontSize = "12px";
    versionBadge.style.fontWeight = "700";
    versionBadge.style.fontFamily = "monospace";
    versionBadge.style.color = THEME.accentSuccess;
    versionBadge.style.padding = "2px 8px";
    versionBadge.style.borderRadius = THEME.radiusSm;
    versionBadge.style.background = "rgba(74, 222, 128, 0.1)";
    versionBadge.style.border = "1px solid rgba(74, 222, 128, 0.25)";
    versionBadge.textContent = "v0001";
    versionRow.appendChild(versionLabel);
    versionRow.appendChild(versionBadge);
    const workflowNameInput = createInput("Workflow name base", state.workflowName || "");
    const assetFolderInput = createInput("Asset subfolder (optional)", state.workflowAsset || "");
    const nextSavePreview = document.createElement("div");
    nextSavePreview.style.fontSize = "10px";
    nextSavePreview.style.color = THEME.textMuted;
    nextSavePreview.style.wordBreak = "break-all";
    nextSavePreview.style.lineHeight = "1.4";
    nextSavePreview.style.padding = "6px 8px";
    nextSavePreview.style.background = "rgba(0, 0, 0, 0.32)";
    nextSavePreview.style.borderRadius = THEME.radiusSm;
    nextSavePreview.style.border = `1px solid ${THEME.borderColor}`;
    nextSavePreview.style.borderLeft = "3px solid #818cf8";
    nextSavePreview.style.fontFamily = "monospace";
    const saveBtn = createButton("Save Workflow to Project", "primary", "pi pi-save");
    saveBtn.style.width = "100%";
    saveBtn.style.padding = "8px 12px";
    saveBtn.style.fontSize = "12px";
    saveBtn.style.fontWeight = "600";
    saveBtn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.28) 0%, rgba(59, 130, 246, 0.2) 100%)";
    saveBtn.style.borderColor = "rgba(129, 140, 248, 0.5)";
    saveBtn.style.color = "#e0e7ff";
    saveBtn.style.boxShadow = "0 1px 4px rgba(99, 102, 241, 0.25)";
    const autoHookSwitch = createSwitch("Auto-hook Ctrl+S to project save", state.autoHookSave !== false, (checked) => {
        state.autoHookSave = checked;
        saveState(state);
        setSettingValue("mjr_project.auto_hook_save", checked);
    });
    const mirrorNote = document.createElement("div");
    mirrorNote.style.fontSize = "10px";
    mirrorNote.style.color = THEME.textMuted;
    mirrorNote.style.lineHeight = "1.3";
    mirrorNote.textContent = "ℹ️ Workflows are also mirrored into user/default/workflows/ for fast access in ComfyUI.";
    const buildWorkflowName = () => {
        const raw = (workflowNameInput.value || state.workflowName || "").trim();
        if (raw)
            return raw;
        const base = state.workflowLastBase || (state.name ? state.name : "Workflow");
        return base;
    };
    const updateNextSavePreview = () => {
        const folder = state.projectFolder || "PROJECT";
        const sub = assetFolderInput.value.trim() ? `${assetFolderInput.value.trim()}/` : "";
        const nameBase = workflowNameInput.value.trim() || state.workflowLastBase || "Workflow";
        const suffix = String(state.workflowNextSuffix || 1).padStart(4, "0");
        versionBadge.textContent = `v${suffix}`;
        saveBtn.textContent = `Save Workflow (v${suffix})`;
        nextSavePreview.textContent = `PROJECTS/${folder}/03_WORKFLOWS/${sub}${nameBase}_${suffix}.json`;
    };
    workflowNameInput.addEventListener("input", () => {
        state.workflowName = workflowNameInput.value;
        saveState(state);
        updateNextSavePreview();
    });
    assetFolderInput.addEventListener("input", () => {
        state.workflowAsset = assetFolderInput.value;
        saveState(state);
        updateNextSavePreview();
    });
    saveBtn.addEventListener("click", async () => {
        if (!state.projectId) {
            toast("error", "No Project", "Select or create an active project first.");
            return;
        }
        saveBtn.disabled = true;
        try {
            const name = workflowNameInput.value.trim();
            await saveWorkflowToProject(state, name || undefined);
            updateWorkflowSection();
            updateHealth();
        }
        catch (e) {
            toast("error", "Save failed", String(e));
        }
        finally {
            saveBtn.disabled = false;
        }
    });
    saveCard.appendChild(versionRow);
    saveCard.appendChild(createRow("Workflow Name", workflowNameInput));
    saveCard.appendChild(createRow("Asset Subfolder", assetFolderInput));
    saveCard.appendChild(nextSavePreview);
    saveCard.appendChild(saveBtn);
    saveCard.appendChild(autoHookSwitch);
    saveCard.appendChild(mirrorNote);
    // -------------------------------------------------------------
    // 2. Signature & Provenance Card
    // -------------------------------------------------------------
    const sigCard = createCard("Workflow Signature");
    const sigStatus = document.createElement("div");
    sigStatus.style.fontSize = "11px";
    sigStatus.style.lineHeight = "1.4";
    const stampSigBtn = createButton("Stamp Active Project Signature", "secondary", "pi pi-bookmark");
    stampSigBtn.addEventListener("click", () => {
        if (!state.projectId) {
            toast("warn", "Signature", "No active project to stamp.");
            return;
        }
        stampGraphProjectSignature(app, state);
        state.workflowHasSignature = true;
        state.workflowChecked = true;
        saveState(state);
        updateWorkflowSection();
        updateHealth();
        toast("success", "Stamped", `Workflow signed with project '${state.projectFolder || state.projectId}'`);
    });
    sigCard.appendChild(sigStatus);
    sigCard.appendChild(stampSigBtn);
    // Assemble Tab
    container.appendChild(saveCard);
    container.appendChild(sigCard);
    const updateWorkflowSection = () => {
        if (state.workflowHasSignature) {
            sigStatus.textContent = `Workflow is signed with: ${state.projectFolder || state.projectId}`;
            sigStatus.style.color = THEME.accentSuccess;
            stampSigBtn.style.display = "none";
        }
        else {
            sigStatus.textContent = "Workflow has no signature stamp (unassigned).";
            sigStatus.style.color = THEME.accentWarning;
            stampSigBtn.style.display = state.projectId ? "inline-flex" : "none";
        }
        workflowNameInput.value = state.workflowName || "";
        assetFolderInput.value = state.workflowAsset || "";
        updateNextSavePreview();
    };
    updateWorkflowSection();
    return {
        element: container,
        updateWorkflowSection,
        buildWorkflowName,
        setWorkflowName: (name) => {
            workflowNameInput.value = name;
            state.workflowName = name;
            saveState(state);
            updateNextSavePreview();
        },
    };
}
//# sourceMappingURL=workflow_tab.js.map