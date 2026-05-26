import type { ComfyGraph, ComfyNode, ProjectMedia, RuntimeState } from "../types/domain.js";
export declare let PATH_WIDGETS: string[];
export declare function loadConfig(): Promise<string[]>;
export declare function detectNodeMedia(node: ComfyNode | null | undefined): ProjectMedia;
export declare function isSaveLikeNode(node: ComfyNode | null | undefined): boolean;
export declare function alreadyProjectPathed(value: unknown): boolean;
export declare function patchSingleNode(node: ComfyNode | null | undefined, relDir: unknown, filenamePrefix: unknown): boolean;
export declare function patchSaveNodes(app: {
    graph?: ComfyGraph;
}, relDir: unknown, filenamePrefix: unknown, targetMedia?: ProjectMedia): Promise<number>;
export declare function stampGraphProjectSignature(app: {
    graph?: ComfyGraph;
}, state: RuntimeState | null | undefined): void;
