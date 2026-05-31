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
async function ensureNewStyleButton() {
    if (buttonElement && document.body.contains(buttonElement))
        return true;
    if (buttonGroupElement && document.body.contains(buttonGroupElement))
        return true;
    if (!app?.menu?.settingsGroup?.element)
        return false;
    try {
        const [{ ComfyButton }, { ComfyButtonGroup }] = await Promise.all([
            import("../../../scripts/ui/components/button.js"),
            import("../../../scripts/ui/components/buttonGroup.js"),
        ]);
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
function ensureLegacyButton() {
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
function applyHealth(state) {
    if (!buttonElement)
        return;
    const health = getHealth(state);
    buttonElement.textContent = health.text;
    buttonElement.title = health.title;
    buttonElement.style.background = health.background;
    buttonElement.style.borderColor = health.border;
    buttonElement.style.color = "white";
}
async function ensureAndUpdate() {
    if (!pendingState)
        return;
    const hasButton = (await ensureNewStyleButton()) || ensureLegacyButton();
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