import type { ComfyGraph, ComfyNode } from "../types/domain.js";
export declare function asGraph(candidate: unknown): ComfyGraph | null;
export declare function getInnerGraphFromNode(node: ComfyNode | null | undefined): ComfyGraph | null;
export declare function collectAllNodes(graph: ComfyGraph | null | undefined): ComfyNode[];
