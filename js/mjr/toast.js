import { app } from "../../../scripts/app.js";

export function ensureStyles() {
  if (document.getElementById("mjr-project-settings-style")) return;
  const style = document.createElement("style");
  style.id = "mjr-project-settings-style";
  style.textContent = `
.mjr-ps-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  will-change: transform;
  transition: transform 80ms ease, background 160ms ease, border-color 160ms ease;
}
.mjr-ps-btn:hover {
  background: rgba(46, 136, 255, 0.25);
  border-color: rgba(46, 136, 255, 0.6);
  transform: scale(1.03);
}
.mjr-ps-btn:active {
  transform: scale(0.96);
}
.mjr-ps-btn:focus-visible {
  outline: 2px solid rgba(46, 136, 255, 0.6);
  outline-offset: 1px;
}
.mjr-ps-select {
  background: rgba(12, 14, 18, 0.7);
  color: #f2f4f8;
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(6px);
  color-scheme: dark;
  appearance: none;
}
.mjr-ps-select option {
  background: #121418 !important;
  color: #f2f4f8 !important;
}
.mjr-ps-select optgroup {
  background: #101218 !important;
  color: #b6c0d3 !important;
}
.mjr-ps-select option:hover,
.mjr-ps-select option:checked {
  background: #1a2230 !important;
  color: #f2f4f8 !important;
}

/* --- MajoorPS: Topbar Project Badge --- */
.mjr-ps-topbar-badge {
  --mjrps-badge-color: #808080;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  margin-left: 10px;
  padding: 4px 6px;

  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(15, 17, 22, 0.65);
  backdrop-filter: blur(6px);

  cursor: pointer;
  user-select: none;

  transition: transform 80ms ease, border-color 160ms ease, background 160ms ease;
}

.mjr-ps-topbar-badge:hover {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.18);
  background: rgba(15, 17, 22, 0.78);
}

.mjr-ps-topbar-badge:active {
  transform: translateY(0px) scale(0.98);
}

.mjr-ps-topbar-badge:focus-visible {
  outline: 2px solid rgba(46, 136, 255, 0.75);
  outline-offset: 2px;
}

.mjr-ps-topbar-badge__left {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;

  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);

  font-size: 11px;
  letter-spacing: 0.3px;
  text-transform: uppercase;

  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjr-ps-topbar-badge__right {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  padding: 2px 8px;
  border-radius: 999px;

  border: 1px solid rgba(0,0,0,0.25);
  background: color-mix(in srgb, var(--mjrps-badge-color) 22%, rgba(0,0,0,0.0));
}

.mjr-ps-topbar-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mjrps-badge-color);
  box-shadow: 0 0 0 2px rgba(0,0,0,0.22);
}

.mjr-ps-topbar-badge__rightText {
  font-size: 12px;
  opacity: 0.95;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;
  document.head.appendChild(style);
}

let toastContainer = null;

function getToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
  let el = document.getElementById("mjr-ps-toast-container");
  if (!el) {
    el = document.createElement("div");
    el.id = "mjr-ps-toast-container";
    el.style.position = "fixed";
    el.style.top = "16px";
    el.style.right = "16px";
    el.style.zIndex = "10000";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.gap = "8px";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
  }
  toastContainer = el;
  return el;
}

export function toast(type, title, message, opts = {}) {
  const map = { success: "success", info: "info", warn: "warn", error: "error" };
  const severity = map[type] || "info";
  try {
    const mgr = app?.extensionManager?.toast;
    if (mgr?.add) {
      mgr.add({
        severity,
        summary: title || "",
        detail: message || "",
        life: Number(opts.life || 4000),
      });
      return;
    }
  } catch (_) {}

  try {
    const container = getToastContainer();
    const item = document.createElement("div");
    const colors = {
      success: "rgba(46, 143, 78, 0.9)",
      info: "rgba(46, 136, 255, 0.9)",
      warn: "rgba(199, 124, 42, 0.9)",
      error: "rgba(179, 58, 58, 0.9)",
    };
    item.style.background = colors[severity] || colors.info;
    item.style.color = "#f2f4f8";
    item.style.padding = "8px 10px";
    item.style.borderRadius = "8px";
    item.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
    item.style.maxWidth = "320px";
    item.style.pointerEvents = "none";
    item.style.backdropFilter = "blur(6px)";

    const strong = document.createElement("div");
    strong.textContent = title || "";
    strong.style.fontWeight = "600";
    strong.style.marginBottom = message ? "2px" : "0";
    const detail = document.createElement("div");
    detail.textContent = message || "";
    detail.style.opacity = "0.9";
    detail.style.fontSize = "12px";

    item.appendChild(strong);
    if (message) item.appendChild(detail);
    container.appendChild(item);

    const life = Number(opts.life || 4000);
    setTimeout(() => {
      if (item.parentNode) item.remove();
    }, life);
  } catch (_) {}
}
