interface MissingModelEntry {
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
interface ModelFixerResult {
    missing_value?: string;
    type_hint?: string;
    candidates?: ModelCandidate[];
    exact_match_wrong_folder?: unknown;
}
interface ModelFixerDialogOptions {
    missing?: MissingModelEntry[];
    results?: ModelFixerResult[];
}
interface ModelFixerSelection {
    missing: MissingModelEntry;
    candidate: ModelCandidate | null;
}
export declare function showModelFixerDialog({ missing, results }?: ModelFixerDialogOptions): Promise<ModelFixerSelection[]>;
export {};
