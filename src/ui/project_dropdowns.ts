import type { ProjectListEntry } from "../types/domain.js";

export interface ProjectDropdownTargets {
  pendingSelect: HTMLSelectElement;
}

export function renderProjectDropdowns(
  targets: ProjectDropdownTargets,
  projects: ProjectListEntry[]
): void {
  const { pendingSelect } = targets;
  const currentPending = pendingSelect.value;

  pendingSelect.innerHTML = "";

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = "-";
  pendingSelect.appendChild(emptyOpt);

  for (const project of projects) {
    const projectId = project.project_id || "";
    if (!projectId) continue;

    const opt = document.createElement("option");
    opt.value = projectId;
    opt.dataset.folder = project.folder || "";
    opt.dataset.exists = project.exists === false ? "false" : "true";
    const missingTag = project.exists === false ? " (missing)" : "";
    const archivedTag = project.archived ? " [archived]" : "";
    opt.textContent = `${project.folder || project.project_id} (${project.project_id})${missingTag}${archivedTag}`;
    pendingSelect.appendChild(opt);
  }

  if (currentPending) pendingSelect.value = currentPending;
}
