import { app } from "../../../scripts/app.js";
const BUTTON_ID = "mjr-project-health-button";
const LEGACY_BUTTON_ID = "mjr-project-health-button-legacy";
let buttonElement = null;
let buttonGroupElement = null;
let pendingState = null;
let createPromise = null;
function openProjectSettings() {
    const sidebar = app?.extensionManager?.sidebar;
    if (sidebar && typeof sidebar.setTab === "function") {
        sidebar.setTab("mjr_project_settings");
        return;
    }
    try {
        const state = pendingState;
        if (state) {
            state.workflowPanelOpen = true;
            state._ui?.updateWorkflowBlock?.();
        }
    }
    catch (_) { }
}
function getHealth(state) {
    const project = state.projectFolder || state.projectId || "No project";
    const output = state.lastRelDir || state.lastPrefix
        ? `${state.lastRelDir || "-"} | ${state.lastPrefix || "-"}`
        : "No output target";
    if (state.lastError) {
        return {
            text: "Project: Error",
            background: "#7f1d1d",
            border: "#ef4444",
            title: `Project Health\nError: ${state.lastError}\nProject: ${project}\nOutput: ${output}`,
        };
    }
    if (state.graphIsEmpty) {
        return {
            text: "Project: Empty",
            background: "#7f1d1d",
            border: "#ef4444",
            title: `Project Health\nGraph is empty\nProject: ${project}\nOutput: ${output}`,
        };
    }
    if (!state.projectId) {
        return {
            text: "Project: None",
            background: "#3f3f46",
            border: "#71717a",
            title: `Project Health\nNo active project\nOutput: ${output}`,
        };
    }
    if (state.projectExists === false) {
        return {
            text: "Project: Missing",
            background: "#7f1d1d",
            border: "#ef4444",
            title: `Project Health\nMissing folder: ${project}\nOutput: ${output}`,
        };
    }
    if (state.workflowChecked && !state.workflowHasSignature) {
        return {
            text: `Project: ${project}`,
            background: "#7c2d12",
            border: "#f97316",
            title: `Project Health\nWorkflow is not assigned\nProject: ${project}\nOutput: ${output}`,
        };
    }
    const det = state.detected;
    const mismatch = det &&
        det.mode !== "none" &&
        !((det.project_id && det.project_id === state.projectId) ||
            (det.project_folder && det.project_folder === state.projectFolder)) &&
        (det.project_id || det.project_folder);
    if (mismatch) {
        return {
            text: "Project: Mismatch",
            background: "#7c2d12",
            border: "#f97316",
            title: `Project Health\nWorkflow: ${det.project_folder || det.project_id}\nActive: ${project}\nOutput: ${output}`,
        };
    }
    return {
        text: `Project: ${project}`,
        background: "#166534",
        border: "#22c55e",
        title: `Project Health\nActive project: ${project}\nWorkflow: assigned\nOutput: ${output}`,
    };
}
function styleProjectButton(el) {
    el.id = BUTTON_ID;
    el.classList.add("comfyui-button", "comfyui-menu-mobile-collapse");
    el.style.maxWidth = "260px";
    el.style.overflow = "hidden";
    el.style.textOverflow = "ellipsis";
    el.style.whiteSpace = "nowrap";
}
let newStyleButtonPromise = null;
let retryTimer = null;
function ensureNewStyleButton() {
    if (buttonElement && document.body.contains(buttonElement))
        return Promise.resolve(true);
    if (buttonGroupElement && document.body.contains(buttonGroupElement))
        return Promise.resolve(true);
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
        buttonElement = existing;
        return Promise.resolve(true);
    }
    if (!app?.menu?.settingsGroup?.element)
        return Promise.resolve(false);
    if (!newStyleButtonPromise) {
        newStyleButtonPromise = createNewStyleButton().finally(() => {
            newStyleButtonPromise = null;
        });
    }
    return newStyleButtonPromise;
}
async function createNewStyleButton() {
    try {
        const [{ ComfyButton }, { ComfyButtonGroup }] = await Promise.all([
            import("../../../scripts/ui/components/button.js"),
            import("../../../scripts/ui/components/buttonGroup.js"),
        ]);
        if (document.getElementById(BUTTON_ID))
            return true;
        const button = new ComfyButton({
            icon: "briefcase",
            action: openProjectSettings,
            tooltip: "Majoor Project Health",
            content: "Project",
            classList: "comfyui-button comfyui-menu-mobile-collapse",
        });
        buttonElement = button.element;
        styleProjectButton(buttonElement);
        const group = new ComfyButtonGroup(buttonElement);
        buttonGroupElement = group.element;
        app.menu.settingsGroup.element.before(buttonGroupElement);
        return true;
    }
    catch (error) {
        console.warn("[mjr] New style ComfyUI button unavailable", error);
        return false;
    }
}
function removeLegacyButton() {
    document.getElementById(LEGACY_BUTTON_ID)?.remove();
}
function ensureLegacyButton() {
    // Modern frontends expose app.menu / .comfyui-menu; the new-style button may just not be ready yet.
    if (app?.menu || document.querySelector(".comfyui-menu"))
        return false;
    let button = document.getElementById(LEGACY_BUTTON_ID);
    if (!button) {
        const menu = document.querySelector(".comfy-menu");
        if (!menu)
            return false;
        button = document.createElement("button");
        button.id = LEGACY_BUTTON_ID;
        button.type = "button";
        button.onclick = openProjectSettings;
        menu.append(button);
    }
    buttonElement = button;
    return true;
}
function dedupeButtons() {
    const all = Array.from(document.querySelectorAll(`#${BUTTON_ID}`));
    if (all.length <= 1)
        return;
    const keep = buttonElement && all.includes(buttonElement) ? buttonElement : all[0];
    buttonElement = keep;
    all.forEach((el) => {
        if (el === keep)
            return;
        const group = el.closest(".comfyui-button-group");
        (group && group !== keep.closest(".comfyui-button-group") ? group : el).remove();
    });
}
function applyHealth(state) {
    dedupeButtons();
    if (!buttonElement)
        return;
    const health = getHealth(state);
    const targets = new Set([buttonElement]);
    document.querySelectorAll(`#${BUTTON_ID}, #${LEGACY_BUTTON_ID}`).forEach((el) => targets.add(el));
    targets.forEach((el) => {
        el.textContent = health.text;
        el.title = health.title;
        el.style.background = health.background;
        el.style.borderColor = health.border;
        el.style.color = "white";
    });
}
async function ensureAndUpdate() {
    if (!pendingState)
        return;
    const hasModern = await ensureNewStyleButton();
    if (hasModern)
        removeLegacyButton();
    const hasButton = hasModern || ensureLegacyButton();
    if (!hasButton) {
        // Menu not mounted yet: retry shortly instead of falling back to a duplicate legacy button.
        if (!retryTimer)
            retryTimer = setTimeout(() => { retryTimer = null; void ensureAndUpdate(); }, 500);
        return;
    }
    if (hasButton && pendingState) {
        applyHealth(pendingState);
    }
}
export function updateMenuStatusBadge(state) {
    pendingState = state;
    if (!createPromise) {
        createPromise = ensureAndUpdate().finally(() => {
            createPromise = null;
        });
    }
    else {
        void createPromise.then(ensureAndUpdate);
    }
}
//# sourceMappingURL=topbar_badge.js.map