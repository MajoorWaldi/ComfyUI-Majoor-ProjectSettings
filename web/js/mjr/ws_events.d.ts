/**
 * WebSocket event subscriptions for Majoor Project Settings.
 *
 * Subscribes to custom events pushed by the Python backend via
 * PromptServer.instance.send_sync() and forwards them to the store.
 *
 * Event names follow the pattern: "mjr.<domain>.<action>"
 * e.g. "mjr.download.progress", "mjr.download.done", "mjr.scan.result"
 *
 * Backend usage (Python):
 *   PromptServer.instance.send_sync("mjr.download.progress", {
 *       "job_id": job_id, "pct": 42, "state": "running", "message": "..."
 *   })
 */
export interface DownloadProgressEvent {
    job_id: string;
    pct: number;
    state: "queued" | "downloading" | "done" | "error";
    message?: string;
    filename?: string;
    downloaded?: number;
    total?: number;
}
export interface ScanResultEvent {
    missing: unknown[];
    total: number;
    job_id?: string;
}
type DownloadProgressHandler = (ev: DownloadProgressEvent) => void;
type ScanResultHandler = (ev: ScanResultEvent) => void;
/** Register a handler for download progress events. Returns unsubscribe fn. */
export declare function onDownloadProgress(fn: DownloadProgressHandler): () => void;
/** Register a handler for scan result events. Returns unsubscribe fn. */
export declare function onScanResult(fn: ScanResultHandler): () => void;
/**
 * Activate WebSocket event listeners.
 * Call once during extension setup.
 */
export declare function registerWsEvents(): void;
export {};
