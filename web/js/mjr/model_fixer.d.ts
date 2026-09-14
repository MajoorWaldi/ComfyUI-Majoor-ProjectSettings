interface ComfyWidget {
    name?: string;
    value?: unknown;
    options?: {
        values?: unknown;
    };
    callback?: (...args: unknown[]) => void;
    [key: string]: unknown;
}
interface ComfyNode {
    id?: unknown;
    type?: string;
    title?: string;
    class_type?: string;
    widgets?: ComfyWidget[];
    widgets_values?: unknown[];
    subgraph?: ComfyGraph;
    graph?: ComfyGraph;
    color?: string | null;
    bgcolor?: string | null;
    [key: string]: unknown;
}
interface ComfyGraph {
    _nodes?: ComfyNode[];
    setDirtyCanvas?: (a: boolean, b: boolean) => void;
    [key: string]: unknown;
}
export declare const MODEL_FILE_EXTENSIONS: Set<string>;
export declare function isModelFileName(name: string): boolean;
export declare function normalizePath(path: string): string;
export declare function typeHintFromNode(node: ComfyNode, widgetName: string): string;
export declare function collectAllNodes(graph: ComfyGraph): ComfyNode[];
export declare function resolveComboValues(widget: ComfyWidget): string[];
export interface OptionsMatchResult {
    isExact: boolean;
    matchValue: string | null;
    foundInSubfolder: boolean;
}
export declare function findMatchInOptions(options: string[], value: string): OptionsMatchResult;
export interface MissingModelEntry {
    node_id: unknown;
    node_title: string;
    widget_name: string;
    missing_value: string;
    type_hint: string;
    found_on_disk_path: string | null;
    suggested_fix: string | null;
    node?: ComfyNode;
    [key: string]: unknown;
}
export interface MissingModelStatsResult {
    missing: MissingModelEntry[];
    total: number;
}
export declare function scanMissingModelsFromGraph(): MissingModelEntry[];
export declare function scanMissingModelsWithStats(): MissingModelStatsResult;
export declare function applyFixesToGraph(fixes: Array<{
    node_id: unknown;
    widget_name: unknown;
    new_value: unknown;
}>): number;
export {};
