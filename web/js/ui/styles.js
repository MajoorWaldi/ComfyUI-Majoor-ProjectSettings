/**
 * Centralized CSS styles for Majoor Project Settings.
 *
 * Injected once into <head> as a single <style> tag.
 * Replaces all scattered inline styles for shared elements.
 *
 * Scoped under the .mjr-ps-* namespace to avoid conflicts.
 * CSS custom properties fall back to ComfyUI's own tokens.
 */
const MJR_STYLES = `
/* ── Base Variables ─────────────────────────────────────────────────────── */
.mjr-ps-root {
  --mjr-accent: var(--p-button-primary-background, #3b82f6);
  --mjr-accent-bg: var(--comfy-input-bg, rgba(59, 130, 246, 0.1));
  --mjr-accent-border: var(--border-color, #404040);
  --mjr-success: var(--success-text, #22c55e);
  --mjr-success-bg: var(--comfy-input-bg, rgba(34, 197, 94, 0.1));
  --mjr-success-border: var(--border-color, #404040);
  --mjr-warning: var(--warning-text, #eab308);
  --mjr-warning-bg: var(--comfy-input-bg, rgba(234, 179, 8, 0.1));
  --mjr-warning-border: var(--border-color, #404040);
  --mjr-error: var(--error-text, #ef4444);
  --mjr-error-bg: var(--comfy-input-bg, rgba(239, 68, 68, 0.1));
  --mjr-error-border: var(--border-color, #404040);
  --mjr-text: var(--fg-color, #ffffff);
  --mjr-text-muted: var(--descrip-text, #999999);
  --mjr-bg-input: var(--comfy-input-bg, #1a1a1a);
  --mjr-border: var(--border-color, #404040);
  --mjr-radius-sm: 2px;
  --mjr-radius-md: 4px;
  --mjr-radius-lg: 6px;
  --mjr-gap: 8px;
  font-family: var(--font-family, sans-serif);
  font-size: 13px;
  color: var(--mjr-text);
  box-sizing: border-box;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.mjr-ps-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--mjr-radius-sm);
  border: 1px solid var(--mjr-border);
  background: var(--comfy-input-bg, #1a1a1a);
  color: var(--mjr-text);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
  white-space: nowrap;
}
.mjr-ps-btn:hover {
  background: var(--bg-color, #2a2a2a);
  border-color: var(--mjr-accent);
}
.mjr-ps-btn:active {
  background: var(--comfy-menu-bg, #101010);
}
.mjr-ps-btn:focus-visible {
  outline: 1px solid var(--mjr-accent);
  outline-offset: -1px;
}
.mjr-ps-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.mjr-ps-btn-primary {
  background: var(--mjr-accent);
  border-color: var(--mjr-accent);
  color: #ffffff;
}
.mjr-ps-btn-primary:hover {
  background: var(--mjr-accent);
  opacity: 0.85;
}
.mjr-ps-btn-danger {
  background: var(--mjr-error-bg);
  border-color: var(--mjr-error);
  color: var(--mjr-error);
}
.mjr-ps-btn-danger:hover {
  background: var(--mjr-error);
  color: #ffffff;
}

/* ── Cards ───────────────────────────────────────────────────────────────── */
.mjr-ps-card {
  display: flex;
  flex-direction: column;
  gap: var(--mjr-gap);
  padding: 8px 10px;
  border-radius: var(--mjr-radius-md);
  background: linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%);
  border: 1px solid var(--mjr-border);
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.mjr-ps-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--mjr-border);
  font-size: 11px;
  font-weight: 600;
  color: var(--mjr-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */
.mjr-ps-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: var(--mjr-radius-sm);
  border: 1px solid var(--mjr-border);
  background: var(--mjr-bg-input);
  color: var(--mjr-text);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s ease;
}
.mjr-ps-input:focus {
  border-color: var(--mjr-accent-border);
  outline: none;
}

/* ── Selects ─────────────────────────────────────────────────────────────── */
.mjr-ps-select {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  border-radius: var(--mjr-radius-sm);
  border: 1px solid var(--mjr-border);
  background: var(--mjr-bg-input);
  color: var(--mjr-text);
  font-size: 12px;
  color-scheme: dark;
  appearance: none;
  outline: none;
  transition: border-color 0.1s ease;
}
.mjr-ps-select:focus {
  border-color: var(--mjr-accent-border);
}
.mjr-ps-select option {
  background: var(--bg-color, #1a1a1a) !important;
  color: var(--mjr-text) !important;
}
.mjr-ps-select optgroup {
  background: var(--comfy-menu-bg, #101010) !important;
  color: var(--mjr-text-muted) !important;
}

/* ── Labels / rows ───────────────────────────────────────────────────────── */
.mjr-ps-label {
  font-size: 11px;
  opacity: 0.85;
  margin-bottom: 2px;
  color: var(--mjr-text-muted);
}
.mjr-ps-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mjr-ps-row-inline {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Status dot ──────────────────────────────────────────────────────────── */
.mjr-ps-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Badge ───────────────────────────────────────────────────────────────── */
.mjr-ps-badge {
  display: none;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1;
}

/* ── Switch ──────────────────────────────────────────────────────────────── */
.mjr-ps-switch-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--mjr-text-muted);
  cursor: pointer;
}
.mjr-ps-switch {
  appearance: none;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  border: 1px solid var(--mjr-border);
  background: rgba(255,255,255,0.08);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.mjr-ps-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mjr-text-muted);
  transition: left 0.15s ease, background 0.15s ease;
}
.mjr-ps-switch:checked {
  background: var(--mjr-accent-bg);
  border-color: var(--mjr-accent-border);
}
.mjr-ps-switch:checked::after {
  left: 14px;
  background: var(--mjr-accent);
}

/* ── Code / mono preview ─────────────────────────────────────────────────── */
.mjr-ps-preview {
  font-size: 10px;
  color: var(--mjr-text-muted);
  word-break: break-all;
  line-height: 1.4;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.32);
  border-radius: var(--mjr-radius-sm);
  border: 1px solid var(--mjr-border);
  border-left: 3px solid var(--mjr-accent);
  font-family: monospace;
}

/* ── Tab buttons ─────────────────────────────────────────────────────────── */
.mjr-ps-tab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 6px;
  border-radius: var(--mjr-radius-sm);
  border: 1px solid transparent;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
  color: var(--mjr-text-muted);
  font-weight: 400;
}
.mjr-ps-tab-btn:hover {
  background: rgba(255,255,255,0.06);
}
.mjr-ps-tab-btn.active {
  background: linear-gradient(180deg, rgba(99, 102, 241, 0.2) 0%, rgba(99, 102, 241, 0.08) 100%);
  border-color: rgba(129, 140, 248, 0.4);
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

/* ── Progress bar ────────────────────────────────────────────────────────── */
.mjr-ps-progress-bar-wrap {
  width: 100%;
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}
.mjr-ps-progress-bar {
  height: 100%;
  background: var(--mjr-accent);
  border-radius: 2px;
  transition: width 0.3s ease;
  min-width: 4px;
}

/* ── Spinner ─────────────────────────────────────────────────────────────── */
@keyframes mjr-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.mjr-ps-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.15);
  border-top-color: var(--mjr-accent);
  border-radius: 50%;
  animation: mjr-spin 0.7s linear infinite;
}
`;
let _injected = false;
/**
 * Inject the shared CSS into <head> exactly once.
 * Safe to call multiple times.
 */
export function injectStyles() {
    if (_injected || document.getElementById("mjr-ps-styles")) {
        _injected = true;
        return;
    }
    const style = document.createElement("style");
    style.id = "mjr-ps-styles";
    style.textContent = MJR_STYLES;
    document.head.appendChild(style);
    _injected = true;
}
//# sourceMappingURL=styles.js.map