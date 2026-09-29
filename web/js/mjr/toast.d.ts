/**
 * Toast notifications — thin wrapper over extensionManager.toast (PrimeVue).
 *
 * Falls back to a minimal inline DOM implementation only when
 * extensionManager.toast is unavailable (very old ComfyUI builds).
 *
 * The old custom toast container implementation has been replaced by
 * the centralized mjr-ps-styles CSS (see ui/styles.ts).
 */
export type ToastType = "success" | "info" | "warn" | "error";
export interface ToastOptions {
    /** Milliseconds before auto-dismiss. Default 4000. */
    life?: number;
    /** If true, only shown when verbose mode is enabled. */
    verbose?: boolean;
    /** If true, always shown regardless of verbose mode. */
    force?: boolean;
}
export declare function isToastVerbose(): boolean;
export declare function setToastVerbose(value: boolean): void;
/** @deprecated Use injectStyles() from ui/styles.ts instead. */
export declare function ensureStyles(): void;
/**
 * Show a toast notification.
 *
 * Routes to extensionManager.toast (PrimeVue) when available,
 * falls back to a minimal inline DOM implementation.
 */
export declare function toast(type: ToastType, title: string, message: string, opts?: ToastOptions): void;
