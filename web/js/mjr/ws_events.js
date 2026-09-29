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
import { api } from "../../../scripts/api.js";
import { notify } from "../state/store.js";
const _downloadHandlers = new Set();
const _scanHandlers = new Set();
let _registered = false;
// ─── Public API ───────────────────────────────────────────────────────────────
/** Register a handler for download progress events. Returns unsubscribe fn. */
export function onDownloadProgress(fn) {
    _downloadHandlers.add(fn);
    return () => _downloadHandlers.delete(fn);
}
/** Register a handler for scan result events. Returns unsubscribe fn. */
export function onScanResult(fn) {
    _scanHandlers.add(fn);
    return () => _scanHandlers.delete(fn);
}
/**
 * Activate WebSocket event listeners.
 * Call once during extension setup.
 */
export function registerWsEvents() {
    if (_registered)
        return;
    _registered = true;
    // Download progress (pushed by model_downloader_routes.py)
    api.addEventListener("mjr.download.progress", (ev) => {
        const detail = ev.detail;
        if (!detail)
            return;
        for (const fn of _downloadHandlers) {
            try {
                fn(detail);
            }
            catch (e) {
                console.error("[mjr ws] download handler error:", e);
            }
        }
        // If a download finishes or errors, refresh store subscribers so the UI updates.
        if (detail.state === "done" || detail.state === "error") {
            notify();
        }
    });
    // Scan result (pushed by model_fixer_routes.py)
    api.addEventListener("mjr.scan.result", (ev) => {
        const detail = ev.detail;
        if (!detail)
            return;
        for (const fn of _scanHandlers) {
            try {
                fn(detail);
            }
            catch (e) {
                console.error("[mjr ws] scan handler error:", e);
            }
        }
        notify();
    });
}
//# sourceMappingURL=ws_events.js.map