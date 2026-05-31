import type { RuntimeState } from "../types/domain.js";
export interface ProjectStatus {
    color: string;
    text: string;
    level: string;
}
export declare function colorWithAlpha(hex: unknown, alpha: unknown): string;
export declare function makeStatus(state: RuntimeState): ProjectStatus;
