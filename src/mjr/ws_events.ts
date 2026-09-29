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

// ─── Event payloads ───────────────────────────────────────────────────────────

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

// ─── Event handlers registry ──────────────────────────────────────────────────

type DownloadProgressHandler = (ev: DownloadProgressEvent) => void;
type ScanResultHandler = (ev: ScanResultEvent) => void;

const _downloadHandlers = new Set<DownloadProgressHandler>();
const _scanHandlers = new Set<ScanResultHandler>();

let _registered = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Register a handler for download progress events. Returns unsubscribe fn. */
export function onDownloadProgress(fn: DownloadProgressHandler): () => void {
  _downloadHandlers.add(fn);
  return () => _downloadHandlers.delete(fn);
}

/** Register a handler for scan result events. Returns unsubscribe fn. */
export function onScanResult(fn: ScanResultHandler): () => void {
  _scanHandlers.add(fn);
  return () => _scanHandlers.delete(fn);
}

/**
 * Activate WebSocket event listeners.
 * Call once during extension setup.
 */
export function registerWsEvents(): void {
  if (_registered) return;
  _registered = true;

  // Download progress (pushed by model_downloader_routes.py)
  api.addEventListener("mjr.download.progress", (ev: Event) => {
    const detail = (ev as CustomEvent).detail as DownloadProgressEvent | undefined;
    if (!detail) return;
    for (const fn of _downloadHandlers) {
      try { fn(detail); } catch (e) { console.error("[mjr ws] download handler error:", e); }
    }
    // If a download finishes or errors, refresh store subscribers so the UI updates.
    if (detail.state === "done" || detail.state === "error") {
      notify();
    }
  });

  // Scan result (pushed by model_fixer_routes.py)
  api.addEventListener("mjr.scan.result", (ev: Event) => {
    const detail = (ev as CustomEvent).detail as ScanResultEvent | undefined;
    if (!detail) return;
    for (const fn of _scanHandlers) {
      try { fn(detail); } catch (e) { console.error("[mjr ws] scan handler error:", e); }
    }
    notify();
  });
}
