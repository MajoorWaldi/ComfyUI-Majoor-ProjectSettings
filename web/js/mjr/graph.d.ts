import type { ComfyNode, GraphOutputMetadata, GraphProjectSignature, SerializedWorkflow } from "../types/domain.js";
export interface DetectedModelInfo {
    raw: string;
    tag: string;
    kind: "checkpoint" | "diffusion" | "unet" | "other";
    nodeType?: string;
    nodeTitle?: string;
}
export declare function readGraphSignature(): GraphProjectSignature | null;
export declare function inferProjectFolderFromGraph(isSaveLikeNodeFn: (node: ComfyNode) => boolean): string;
export declare function detectModelInfoFromGraph(token3TagFn: (raw: unknown, upper?: boolean) => string): DetectedModelInfo | null;
export declare function detectModelFromGraph(token3TagFn: (raw: unknown, upper?: boolean) => string): string;
export declare function getSerializedWorkflow(): SerializedWorkflow | null;
export declare function extractGraphOutputMetadata(isSaveLikeNodeFn: (node: ComfyNode) => boolean): GraphOutputMetadata | null;
