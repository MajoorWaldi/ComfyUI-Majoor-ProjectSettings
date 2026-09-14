/**
 * Model Tab component for Majoor Project Settings.
 * Handles active model selection, custom model tagging, community registry search,
 * and missing models repair/download utilities.
 */
import type { RuntimeState } from "../../types/domain.js";
export interface ModelTabContext {
    state: RuntimeState;
    updateUI: () => void;
    updateHealth: () => void;
    fixerState: {
        missing: number;
        fixed: number;
        total: number;
        cacheCount: number;
        cacheUpdatedAt: string;
        cacheError: string;
        scanned: boolean;
        lastScanToken: number;
    };
}
export declare function buildModelTab(ctx: ModelTabContext): {
    element: HTMLElement;
    refreshMissingStatus: () => void;
    updateModelSection: () => void;
};
