/**
 * Main UI Components orchestrator for ComfyUI-Majoor-ProjectSettings.
 * Modular, strictly typed, and aligned with modern ComfyUI v0.34+ frontend architecture.
 */

import { ensureStyles } from "./mjr/toast.js";
import { updateMenuStatusBadge } from "./mjr/topbar_badge.js";
import { saveState } from "./state_manager.js";
import type { RuntimeState, SidebarRenderOptions } from "./types/domain.js";
import { THEME } from "./ui/theme.js";
import { colorWithAlpha, makeStatus } from "./ui/project_status.js";
import { buildProjectTab } from "./ui/tabs/project_tab.js";
import { buildModelTab } from "./ui/tabs/model_tab.js";
import { buildWorkflowTab } from "./ui/tabs/workflow_tab.js";

export function buildPanel(el: HTMLElement, state: RuntimeState, actions: SidebarRenderOptions): void {
  el.innerHTML = "";
  ensureStyles();

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = THEME.gap;
  container.style.fontSize = "12px";
  container.style.color = THEME.textColor;
  container.style.fontFamily = THEME.fontFamily;
  container.style.padding = "8px 12px 20px";
  container.style.boxSizing = "border-box";
  container.style.minHeight = "100%";

  // Fixer shared state tracker
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

  // -------------------------------------------------------------
  // 1. Top Modern Status Chip Bar
  // -------------------------------------------------------------
  const statusBar = document.createElement("div");
  statusBar.style.display = "flex";
  statusBar.style.alignItems = "center";
  statusBar.style.gap = "8px";
  statusBar.style.padding = "6px 8px";
  statusBar.style.borderRadius = THEME.radiusSm;
  statusBar.style.position = "sticky";
  statusBar.style.top = "0";
  statusBar.style.zIndex = "10";
  statusBar.style.cursor = "pointer";
  statusBar.style.background = "rgba(255, 255, 255, 0.03)";
  statusBar.style.border = `1px solid ${THEME.borderColor}`;
  statusBar.style.transition = "border-color 0.15s ease, background 0.15s ease";
  statusBar.title = "Click to toggle project view";

  const statusDot = document.createElement("div");
  statusDot.style.width = "7px";
  statusDot.style.height = "7px";
  statusDot.style.borderRadius = "50%";
  statusDot.style.flexShrink = "0";

  const statusText = document.createElement("div");
  statusText.style.fontWeight = "500";
  statusText.style.fontSize = "11px";
  statusText.style.whiteSpace = "nowrap";
  statusText.style.overflow = "hidden";
  statusText.style.textOverflow = "ellipsis";
  statusText.style.flex = "1";
  statusText.style.color = THEME.textColor;

  statusBar.appendChild(statusDot);
  statusBar.appendChild(statusText);

  // -------------------------------------------------------------
  // 2. Tab Navigation
  // -------------------------------------------------------------
  const tabsNav = document.createElement("div");
  tabsNav.style.display = "grid";
  tabsNav.style.gridTemplateColumns = "1fr 1fr 1fr";
  tabsNav.style.gap = "2px";
  tabsNav.style.position = "sticky";
  tabsNav.style.top = "32px";
  tabsNav.style.zIndex = "9";
  tabsNav.style.padding = "2px";
  tabsNav.style.borderRadius = THEME.radiusSm;
  tabsNav.style.background = "rgba(255, 255, 255, 0.03)";
  tabsNav.style.border = `1px solid ${THEME.borderColor}`;

  const tabPanelsContainer = document.createElement("div");
  tabPanelsContainer.style.display = "flex";
  tabPanelsContainer.style.flexDirection = "column";
  tabPanelsContainer.style.gap = THEME.gap;

  let activeTabId = "project";
  const tabButtons: Record<string, HTMLButtonElement> = {};
  const tabPanes: Record<string, HTMLElement> = {};
  const tabBadges: Record<string, HTMLElement> = {};

  const selectTab = (tabId: string) => {
    activeTabId = tabPanes[tabId] ? tabId : "project";
    for (const [id, pane] of Object.entries(tabPanes)) {
      const selected = id === activeTabId;
      pane.style.display = selected ? "flex" : "none";
      const btn = tabButtons[id];
      if (btn) {
        if (selected) {
          btn.style.background = "linear-gradient(180deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.08) 100%)";
          btn.style.borderColor = "rgba(129, 140, 248, 0.4)";
          btn.style.color = "#ffffff";
          btn.style.fontWeight = "600";
          btn.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.25)";
        } else {
          btn.style.background = "transparent";
          btn.style.borderColor = "transparent";
          btn.style.color = THEME.textMuted;
          btn.style.fontWeight = "400";
          btn.style.boxShadow = "none";
        }
      }
    }
  };

  const createTabButton = (id: string, label: string, icon: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mjr-ps-btn";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "4px";
    btn.style.padding = "6px 6px";
    btn.style.borderRadius = THEME.radiusSm;
    btn.style.border = "1px solid transparent";
    btn.style.fontSize = "11px";
    btn.style.cursor = "pointer";
    btn.style.transition = "all 0.15s ease";

    const iconEl = document.createElement("i");
    iconEl.className = icon;
    iconEl.style.fontSize = "11px";

    const textEl = document.createElement("span");
    textEl.textContent = label;

    const badgeEl = document.createElement("span");
    badgeEl.style.display = "none";
    badgeEl.style.fontSize = "9px";
    badgeEl.style.fontWeight = "700";
    badgeEl.style.padding = "1px 4px";
    badgeEl.style.borderRadius = "3px";
    badgeEl.style.lineHeight = "1";
    badgeEl.style.marginLeft = "2px";

    btn.appendChild(iconEl);
    btn.appendChild(textEl);
    btn.appendChild(badgeEl);

    btn.addEventListener("click", () => selectTab(id));
    tabButtons[id] = btn;
    tabBadges[id] = badgeEl;
    tabsNav.appendChild(btn);
  };

  createTabButton("project", "Project", "pi pi-briefcase");
  createTabButton("model", "Models", "pi pi-box");
  createTabButton("workflow", "Workflow", "pi pi-sitemap");

  // -------------------------------------------------------------
  // 3. Build Sub-Tabs
  // -------------------------------------------------------------
  const dummyUpdateHealth = () => {};

  const projectTab = buildProjectTab({
    state,
    actions,
    updateUI: () => updateStatus(),
    updateStatus: () => updateStatus(),
    updateTargetLabel: () => {},
    refreshExistingNames: () => {},
    fixerState,
  });

  const modelTab = buildModelTab({
    state,
    updateUI: () => updateStatus(),
    updateHealth: () => projectTab.updateHealth(),
    fixerState,
  });

  const workflowTab = buildWorkflowTab({
    state,
    actions,
    updateUI: () => updateStatus(),
    updateHealth: () => projectTab.updateHealth(),
  });

  tabPanes.project = projectTab.element;
  tabPanes.model = modelTab.element;
  tabPanes.workflow = workflowTab.element;

  tabPanelsContainer.appendChild(projectTab.element);
  tabPanelsContainer.appendChild(modelTab.element);
  tabPanelsContainer.appendChild(workflowTab.element);

  // -------------------------------------------------------------
  // 4. Status Bar Logic
  // -------------------------------------------------------------
  const updateTabBadges = () => {
    // Model tab badge
    const modelBadge = tabBadges["model"];
    if (modelBadge) {
      if (fixerState.scanned && fixerState.missing > 0) {
        modelBadge.textContent = String(fixerState.missing);
        modelBadge.style.display = "inline-block";
        modelBadge.style.background = "rgba(239, 68, 68, 0.2)";
        modelBadge.style.color = "#fca5a5";
        modelBadge.style.border = "1px solid rgba(239, 68, 68, 0.4)";
      } else {
        modelBadge.style.display = "none";
      }
    }

    // Workflow tab badge
    const wfBadge = tabBadges["workflow"];
    if (wfBadge) {
      const suffix = state.workflowNextSuffix ? `v${state.workflowNextSuffix}` : "";
      if (suffix) {
        wfBadge.textContent = suffix;
        wfBadge.style.display = "inline-block";
        wfBadge.style.background = "rgba(255, 255, 255, 0.08)";
        wfBadge.style.color = THEME.textMuted;
        wfBadge.style.border = `1px solid ${THEME.borderColor}`;
      } else {
        wfBadge.style.display = "none";
      }
    }
  };

  const updateStatus = () => {
    const s = makeStatus(state);
    statusBar.style.background = "linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0.012) 100%)";
    statusBar.style.borderColor = THEME.borderColor;
    statusBar.style.borderLeft = `3px solid ${s.color}`;
    statusDot.style.background = s.color;
    statusDot.style.boxShadow = `0 0 6px ${s.color}`;
    statusText.textContent = s.text;
    statusText.style.color = THEME.textColor;

    projectTab.updateHealth();
    projectTab.updateResolve();
    workflowTab.updateWorkflowSection();
    modelTab.updateModelSection();
    updateMenuStatusBadge(state);
    updateTabBadges();
  };

  statusBar.addEventListener("click", () => {
    state.workflowPanelOpen = !state.workflowPanelOpen;
    saveState(state);
    selectTab("project");
  });

  // Assemble full UI container
  container.appendChild(statusBar);
  container.appendChild(tabsNav);
  container.appendChild(tabPanelsContainer);
  el.appendChild(container);

  // -------------------------------------------------------------
  // 5. Register runtime UI callbacks on state._ui
  // -------------------------------------------------------------
  state._ui = {
    updateStatus,
    updateResolve: projectTab.updateResolve,
    updateWorkflowBlock: projectTab.updateWorkflowBlock,
    updateTargetLabel: projectTab.updateTargetLabel,
    refreshExistingNames: projectTab.refreshExistingNames,
    refreshMissingStatus: modelTab.refreshMissingStatus,
    updatePreview: projectTab.updatePreview,
    resetForProjectChange: projectTab.resetForProjectChange,
    refreshProjectsList: projectTab.refreshProjectsList,
    buildWorkflowName: workflowTab.buildWorkflowName,
    setWorkflowName: workflowTab.setWorkflowName,
  };

  selectTab(activeTabId);
  updateStatus();
}
