/**
 * Toast notifications — thin wrapper over extensionManager.toast (PrimeVue).
 *
 * Falls back to a minimal inline DOM implementation only when
 * extensionManager.toast is unavailable (very old ComfyUI builds).
 *
 * The old custom toast container implementation has been replaced by
 * the centralized mjr-ps-styles CSS (see ui/styles.ts).
 */
import { app } from "../../../scripts/app.js";
import { getSettingBool, setSettingValue } from "./settings.js";
// ─── Verbose mode ─────────────────────────────────────────────────────────────
export function isToastVerbose() {
    try {
        const ls = localStorage.getItem("mjr_project_toast_verbose");
        if (ls !== null)
            return ls === "true";
    }
    catch (_) { }
    return getSettingBool("mjr_project.toast_verbose", false);
}
export function setToastVerbose(value) {
    try {
        localStorage.setItem("mjr_project_toast_verbose", value ? "true" : "false");
    }
    catch (_) { }
    setSettingValue("mjr_project.toast_verbose", value);
}
// ─── CSS injection (legacy styles — kept for backward compat) ─────────────────
/** @deprecated Use injectStyles() from ui/styles.ts instead. */
export function ensureStyles() {
    // No-op: styles are now injected by ui/styles.ts injectStyles().
    // Kept to avoid import errors in existing code.
}
// ─── Fallback container ───────────────────────────────────────────────────────
let _fallbackContainer = null;
function _getFallbackContainer() {
    if (_fallbackContainer && document.body.contains(_fallbackContainer))
        return _fallbackContainer;
    let el = document.getElementById("mjr-ps-toast-fb");
    if (!el) {
        el = document.createElement("div");
        el.id = "mjr-ps-toast-fb";
        el.style.cssText = [
            "position:fixed",
            "top:16px",
            "right:16px",
            "z-index:10000",
            "display:flex",
            "flex-direction:column",
            "gap:8px",
            "pointer-events:none",
        ].join(";");
        document.body.appendChild(el);
    }
    _fallbackContainer = el;
    return el;
}
const _fallbackColors = {
    success: "rgba(46,143,78,0.92)",
    info: "rgba(46,136,255,0.92)",
    warn: "rgba(199,124,42,0.92)",
    error: "rgba(179,58,58,0.92)",
};
function _showFallbackToast(type, title, message, life) {
    try {
        const container = _getFallbackContainer();
        const item = document.createElement("div");
        item.style.cssText = [
            `background:${_fallbackColors[type] || _fallbackColors.info}`,
            "color:#f2f4f8",
            "padding:8px 10px",
            "border-radius:8px",
            "box-shadow:0 6px 16px rgba(0,0,0,0.3)",
            "max-width:320px",
            "pointer-events:none",
            "backdrop-filter:blur(6px)",
        ].join(";");
        const titleEl = document.createElement("div");
        titleEl.textContent = title || "";
        titleEl.style.cssText = "font-weight:600;margin-bottom:" + (message ? "2px" : "0");
        const detailEl = document.createElement("div");
        detailEl.textContent = message || "";
        detailEl.style.cssText = "opacity:0.9;font-size:12px";
        item.appendChild(titleEl);
        if (message)
            item.appendChild(detailEl);
        container.appendChild(item);
        setTimeout(() => { item.parentNode?.removeChild(item); }, life);
    }
    catch (_) { }
}
// ─── Main toast function ──────────────────────────────────────────────────────
/**
 * Show a toast notification.
 *
 * Routes to extensionManager.toast (PrimeVue) when available,
 * falls back to a minimal inline DOM implementation.
 */
export function toast(type, title, message, opts = {}) {
    const verbose = isToastVerbose();
    // Suppress verbose-only toasts unless forced or verbose mode is on
    if (!verbose && !opts.force) {
        if (type === "info" || opts.verbose === true) {
            console.debug("[mjr toast:muted]", type, title, message);
            return;
        }
    }
    const severity = type;
    const life = Number(opts.life || 4000);
    // Primary: extensionManager.toast (PrimeVue native, v1.x+)
    try {
        const mgr = app?.extensionManager?.toast;
        if (mgr?.add) {
            mgr.add({ severity, summary: title || "", detail: message || "", life });
            return;
        }
    }
    catch (_) { }
    // Fallback: minimal inline DOM toast
    _showFallbackToast(type, title, message, life);
}
//# sourceMappingURL=toast.js.map