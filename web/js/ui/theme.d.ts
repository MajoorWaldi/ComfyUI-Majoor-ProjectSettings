/**
 * Clean, native dark design system and UI helpers for ComfyUI-Majoor-ProjectSettings.
 * Aligned with ComfyUI v0.34+ and modern dark studio interface.
 * Unobtrusive, sober, low-contrast, no flashy glows or saturated gradients.
 */
export declare const THEME: {
    bgPanel: string;
    bgCard: string;
    bgCardHover: string;
    bgInput: string;
    borderColor: string;
    borderActive: string;
    primaryColor: string;
    textColor: string;
    textMuted: string;
    textDim: string;
    accentPrimary: string;
    accentPrimaryBg: string;
    accentPrimaryBorder: string;
    accentSuccess: string;
    accentSuccessBg: string;
    accentSuccessBorder: string;
    accentWarning: string;
    accentWarningBg: string;
    accentWarningBorder: string;
    accentError: string;
    accentErrorBg: string;
    accentErrorBorder: string;
    accentCyan: string;
    accentCyanBg: string;
    accentCyanBorder: string;
    radiusSm: string;
    radiusMd: string;
    radiusLg: string;
    fontFamily: string;
    gap: string;
};
export declare function createCard(title?: string, badgeText?: string, badgeColor?: string): HTMLDivElement;
export declare function createBadge(text: string, color?: string): HTMLSpanElement;
export declare function createButton(text: string, variant?: "primary" | "secondary" | "danger" | "ghost", icon?: string): HTMLButtonElement;
export declare function createInput(placeholder?: string, value?: string): HTMLInputElement;
export declare function createSelect(options?: Array<{
    value: string;
    label: string;
}>): HTMLSelectElement;
export declare function createRow(labelText: string, contentEl: HTMLElement, tooltip?: string): HTMLDivElement;
export declare function createSwitch(labelText: string, checked: boolean, onChange?: (checked: boolean) => void): HTMLLabelElement;
export declare function createDetails(titleText: string, defaultOpen?: boolean): HTMLDetailsElement & {
    _summary?: HTMLElement;
};
export declare function createSegmentedControl<T extends string>(options: Array<{
    value: T;
    label: string;
    icon?: string;
}>, initialValue: T, onChange: (value: T) => void): {
    element: HTMLElement;
    setValue: (val: T) => void;
    getValue: () => T;
};
export declare function createStatusTile(label: string, initialValue: string, icon?: string, initialColor?: string): {
    element: HTMLDivElement;
    update: (value: string, color?: string, subtitle?: string) => void;
};
