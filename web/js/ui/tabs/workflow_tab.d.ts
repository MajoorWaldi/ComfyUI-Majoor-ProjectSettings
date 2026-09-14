/**
 * Workflow Tab component for Majoor Project Settings.
 * Manages project-aware workflow saves, versioned suffixes, signature stamping,
 * and mirroring to ComfyUI's user workflows directory.
 */
import type { RuntimeState, SidebarRenderOptions } from "../../types/domain.js";
export interface WorkflowTabContext {
    state: RuntimeState;
    actions: SidebarRenderOptions;
    updateUI: () => void;
    updateHealth: () => void;
}
export declare function buildWorkflowTab(ctx: WorkflowTabContext): {
    element: HTMLElement;
    updateWorkflowSection: () => void;
    buildWorkflowName: () => string;
    setWorkflowName: (name: string) => void;
};
