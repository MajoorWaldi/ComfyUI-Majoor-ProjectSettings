/**
 * Project Tab component for Majoor Project Settings.
 * Manages project health, project creation/activation, output targets, and safe patching.
 */
import type { RuntimeState, SidebarRenderOptions } from "../../types/domain.js";
export interface ProjectTabContext {
    state: RuntimeState;
    actions: SidebarRenderOptions;
    updateUI: () => void;
    updateStatus: () => void;
    fixerState: {
        scanned: boolean;
        missing: number;
        total: number;
    };
}
export declare function buildProjectTab(ctx: ProjectTabContext): {
    element: HTMLElement;
    updateHealth: () => void;
    updateResolve: () => void;
    updateWorkflowBlock: () => void;
    refreshProjectsList: (force?: boolean) => void;
    resetForProjectChange: () => void;
    updatePreview: () => Promise<void>;
    updateTargetLabel: () => void;
    refreshExistingNames: () => void;
};
