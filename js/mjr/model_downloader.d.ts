export declare function getKindOptions(): {
    value: string;
    label: string;
}[];
export declare function typeHintToKind(typeHint: any): any;
export declare function getAllowedExtensions(): string[];
export declare function isValidUrl(url: any): boolean;
export declare function extractFilenameFromUrl(url: any): string;
export declare function hasAllowedExtension(filename: any): boolean;
export declare function normalizeKey(value: any): string;
export declare function collectNoteRecipes(workflowJson: any): Map<any, any>;
