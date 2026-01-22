import { ensureStyles } from "./toast.js";

/**
 * Badge Topbar "Project"
 * - robust mounting (attend que la topbar existe)
 * - update via CSS vars (couleur) + texte
 *
 * Usage:
 *   const badge = installTopbarProjectBadge({ onClick: () => ... });
 *   badge.update({ leftText, rightText, color, tooltip });
 */
export function installTopbarProjectBadge({ onClick } = {}) {
  ensureStyles();

  const ID = "mjr-ps-topbar-project-badge";
  let root = document.getElementById(ID);
  let observer = null;

  const findHost = () => {
    // Sélecteurs "défensifs" (ComfyUI a déjà changé plusieurs fois ses wrappers)
    return (
      document.querySelector("#comfyui-topbar") ||
      document.querySelector("#comfy-menu") ||
      document.querySelector(".comfy-menu") ||
      document.querySelector(".comfyui-menu") ||
      document.querySelector(".comfy-topbar") ||
      document.querySelector("header")
    );
  };

  const build = () => {
    if (root) return root;

    root = document.createElement("div");
    root.id = ID;
    root.className = "mjr-ps-topbar-badge";
    root.setAttribute("role", "button");
    root.tabIndex = 0;

    const left = document.createElement("span");
    left.className = "mjr-ps-topbar-badge__left";

    const right = document.createElement("span");
    right.className = "mjr-ps-topbar-badge__right";

    const dot = document.createElement("span");
    dot.className = "mjr-ps-topbar-badge__dot";

    const rightText = document.createElement("span");
    rightText.className = "mjr-ps-topbar-badge__rightText";

    right.appendChild(dot);
    right.appendChild(rightText);

    root.appendChild(left);
    root.appendChild(right);

    const click = () => {
      try {
        onClick && onClick();
      } catch (_) {}
    };

    root.addEventListener("click", click);
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        click();
      }
    });

    return root;
  };

  const mount = () => {
    const host = findHost();
    const el = build();
    if (!host) return false;

    // Évite les doublons si hot-reload / refresh partiel
    if (el.parentElement !== host) {
      el.remove();
      // Ajout en fin de topbar (tu peux changer en insertBefore si tu veux)
      host.appendChild(el);
    }
    return true;
  };

  const waitMount = () => {
    if (mount()) return;

    // attend que la topbar existe
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (mount()) {
        observer.disconnect();
        observer = null;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const update = ({ leftText, rightText, color, tooltip } = {}) => {
    waitMount();

    const el = document.getElementById(ID);
    if (!el) return;

    const left = el.querySelector(".mjr-ps-topbar-badge__left");
    const rt = el.querySelector(".mjr-ps-topbar-badge__rightText");

    if (leftText != null) left.textContent = String(leftText);
    if (rightText != null) rt.textContent = String(rightText);

    const c = color || "#808080";
    el.style.setProperty("--mjrps-badge-color", c);

    if (tooltip != null) el.title = String(tooltip);
  };

  const remove = () => {
    if (observer) observer.disconnect();
    observer = null;
    const el = document.getElementById(ID);
    if (el) el.remove();
  };

  // Montage initial
  waitMount();

  return { update, remove };
}
