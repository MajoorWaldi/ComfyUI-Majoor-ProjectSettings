export interface MissingModelEntry {
    missing_value?: string;
    type_hint?: string;
    node_title?: string;
    widget_name?: string;
    [key: string]: unknown;
}
interface ModelCandidate {
    score?: number;
    basename?: string;
    relpath?: string;
    kind?: string;
    [key: string]: unknown;
}
export interface ModelFixerResult {
    missing_value?: string;
    type_hint?: string;
    candidates?: ModelCandidate[];
    exact_match_wrong_folder?: unknown;
}
interface ModelFixerDialogOptions {
    missing?: MissingModelEntry[];
    results?: ModelFixerResult[];
}
interface FixerFix {
    node_id: unknown;
    widget_name: unknown;
    new_value: string;
}
export declare function showModelFixerDialog({ missing, results }?: ModelFixerDialogOptions): Promise<FixerFix[] | null>;
export {};
