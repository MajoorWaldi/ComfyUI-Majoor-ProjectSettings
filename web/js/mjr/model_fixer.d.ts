export declare function scanMissingModelsFromGraph(): {
    node_id: {} | null;
    node_title: string;
    widget_name: string;
    missing_value: string;
    type_hint: string;
}[];
export declare function scanMissingModelsWithStats(): {
    missing: {
        node_id: {} | null;
        node_title: string;
        widget_name: string;
        missing_value: string;
        type_hint: string;
    }[];
    total: number;
};
export declare function applyFixesToGraph(fixes: Array<{
    node_id: unknown;
    widget_name: unknown;
    new_value: unknown;
}>): number;
