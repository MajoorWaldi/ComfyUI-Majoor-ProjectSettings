export type ToastType = "success" | "info" | "warn" | "error";
export interface ToastOptions {
    life?: number;
}
export declare function ensureStyles(): void;
export declare function toast(type: ToastType, title: string, message: string, opts?: ToastOptions): void;
