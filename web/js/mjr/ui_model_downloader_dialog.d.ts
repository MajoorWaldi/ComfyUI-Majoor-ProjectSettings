interface DownloadRecipe {
    url?: string;
    filename?: string;
    kind?: string;
    sha256?: string;
    [key: string]: unknown;
}
interface DownloaderEntry {
    missing_value?: string;
    type_hint?: string;
    recipe?: DownloadRecipe | null;
    key?: string;
    kind?: string;
    prefilled?: boolean;
    [key: string]: unknown;
}
interface DownloaderDialogOptions {
    entries?: DownloaderEntry[];
    kindOptions?: Array<{
        value: string;
        label: string;
    }>;
    existingMap?: Map<string, Set<string>> | null;
}
interface DownloaderDialogResult {
    items: DownloaderEntry[];
    remember: boolean;
    saveItems: DownloaderEntry[];
}
export declare function showModelDownloaderDialog({ entries, kindOptions, existingMap, }?: DownloaderDialogOptions): Promise<DownloaderDialogResult | null>;
export {};
