export type ToastType = "success" | "info" | "warn" | "error";
export interface ToastOptions {
    life?: number;
    verbose?: boolean;
    force?: boolean;
}
export declare function isToastVerbose(): boolean;
export declare function setToastVerbose(value: boolean): void;
export declare function ensureStyles(): void;
export declare function toast(type: ToastType, title: string, message: string, opts?: ToastOptions): void;
