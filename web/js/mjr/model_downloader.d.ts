export declare function getKindOptions(): {
    value: string;
    label: string;
}[];
export declare function typeHintToKind(typeHint: string): string;
export declare function getAllowedExtensions(): string[];
export declare function isValidUrl(url: string): boolean;
export declare function extractFilenameFromUrl(url: string): string;
export declare function hasAllowedExtension(filename: string): boolean;
export declare function normalizeKey(value: string): string;
export declare function collectNoteRecipes(workflowJson: unknown): Map<string, Record<string, string>>;
