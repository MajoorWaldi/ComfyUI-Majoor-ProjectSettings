import type { RuntimeState } from "../types/domain.js";
import { getSettingBool } from "../mjr/settings.js";

const SETTING_NO_PROJECT_STATUS_BLACK = "mjr_project.status_black_no_project";

export interface ProjectStatus {
  color: string;
  text: string;
  level: string;
}

function parseHexColor(hex: unknown): [number, number, number] | null {
  const m = String(hex || "").trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const v = m[1];
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

export function colorWithAlpha(hex: unknown, alpha: unknown): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return String(hex);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

export function makeStatus(state: RuntimeState): ProjectStatus {
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
