export type DetailsWithSummary = HTMLDetailsElement & {
    _summary?: HTMLElement;
};
export interface PanelHelpers {
    section: (label: string) => HTMLDivElement;
    divider: (thick?: boolean) => HTMLDivElement;
    detailsSection: (title: string) => DetailsWithSummary;
    makeLabel: (labelText: string) => HTMLLabelElement;
    styleField: (inputEl: HTMLElement) => void;
    row: (labelText: string, inputEl: HTMLElement) => HTMLDivElement;
    groupRow: (labelText: string, contentEl: HTMLElement) => HTMLDivElement;
    btn: (text: string) => HTMLButtonElement;
}
export declare function createPanelHelpers(gap: string): PanelHelpers;
