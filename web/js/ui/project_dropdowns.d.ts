import type { ProjectListEntry } from "../types/domain.js";
export interface ProjectDropdownTargets {
    pendingSelect: HTMLSelectElement;
}
export declare function renderProjectDropdowns(targets: ProjectDropdownTargets, projects: ProjectListEntry[]): void;
