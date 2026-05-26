import { applyStyles, createElement } from "./dom.js";
import type { RuntimeState } from "../types/domain.js";

const MENU_BADGE_ID = "mjr-project-status-badge";
const MENU_ACTION_SELECTORS = [
  ".comfy-menu-actions",
  ".comfy-menu-no-drag",
  ".comfy-topbar-actions",
  ".comfy-menu",
  ".workflow-tabs-container",
  ".workflow-tabs-container .flex",
  ".menu-actions",
];

let menuBadgeInterval: ReturnType<typeof setInterval> | null = null;
let menuBadgePendingState: RuntimeState | null = null;
let menuBadgeLogTimestamp = 0;

function findMenuActionsContainer(): Element | null {
  for (const selector of MENU_ACTION_SELECTORS) {
    const candidate = document.querySelector(selector);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function ensureMenuStatusBadge(actions: Element, text: string, color: string): HTMLElement {
  let badge = document.getElementById(MENU_BADGE_ID);
  if (!badge) {
    badge = createElement("div", {
      id: MENU_BADGE_ID,
      styles: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "600",
        border: "1px solid transparent",
        marginLeft: "8px",
        gap: "4px",
        transition: "background 0.3s ease, border 0.3s ease",
        cursor: "default",
      },
    });
    actions.appendChild(badge);
  }
  badge.textContent = text;
  applyStyles(badge, {
    background: color,
    borderColor: color,
  });
  return badge;
}

export function updateMenuStatusBadge(state: RuntimeState): void {
  menuBadgePendingState = state;
  const actions = findMenuActionsContainer();
  if (!actions) {
    if (!menuBadgeInterval) {
      menuBadgeInterval = setInterval(() => {
        if (menuBadgePendingState) {
          updateMenuStatusBadge(menuBadgePendingState);
        }
      }, 500);
    }
    const now = Date.now();
    if (now - menuBadgeLogTimestamp > 5000) {
      console.info(
        `[mjr] Waiting for topbar badge target (${MENU_ACTION_SELECTORS.join(
          ", "
        )}) project=${state?.projectId || "none"} folder=${state?.projectFolder || "none"}`
      );
      menuBadgeLogTimestamp = now;
    }
    console.debug("[mjr] comfy menu actions not found yet, retrying badge soon", state);
    return;
  }

  if (menuBadgeInterval) {
    clearInterval(menuBadgeInterval);
    menuBadgeInterval = null;
  }

  const badgeText = state.projectId
    ? state.projectExists === false
      ? "Projet introuvable"
      : `Projet: ${state.projectFolder || state.projectId}`
    : "Pas de projet actif";
  const badgeColor = state.projectId
    ? state.projectExists === false
      ? "rgba(179, 58, 58, 0.9)"
      : "rgba(47, 143, 78, 0.95)"
    : "rgba(102, 102, 102, 0.8)";
  ensureMenuStatusBadge(actions, badgeText, badgeColor);
  menuBadgePendingState = null;
}
