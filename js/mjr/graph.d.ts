import type { ComfyNode, GraphProjectSignature, SerializedWorkflow } from "../types/domain.js";
export declare function readGraphSignature(): GraphProjectSignature | null;
export declare function inferProjectFolderFromGraph(isSaveLikeNodeFn: (node: ComfyNode) => boolean): string;
export declare function detectModelFromGraph(token3TagFn: (raw: unknown, upper?: boolean) => string): string;
export declare function getSerializedWorkflow(): SerializedWorkflow | null;
