/**
 * Clean, native dark design system and UI helpers for ComfyUI-Majoor-ProjectSettings.
 * Aligned with ComfyUI v0.34+ and modern dark studio interface.
 * Unobtrusive, sober, low-contrast, no flashy glows or saturated gradients.
 */
export const THEME = {
    bgPanel: "var(--bg-color, #1a1a1a)",
    bgCard: "linear-gradient(180deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0.012) 100%)",
    bgCardHover: "rgba(255, 255, 255, 0.045)",
    bgInput: "var(--comfy-input-bg, #161616)",
    borderColor: "var(--border-color, rgba(255, 255, 255, 0.09))",
    borderActive: "rgba(99, 102, 241, 0.5)",
    primaryColor: "var(--fg-color, #e4e4e7)",
    textColor: "var(--fg-color, #e4e4e7)",
    textMuted: "var(--descrip-text, #9ca3af)",
    textDim: "rgba(156, 163, 175, 0.6)",
    accentPrimary: "#818cf8", // soft indigo
    accentPrimaryBg: "rgba(99, 102, 241, 0.12)",
    accentPrimaryBorder: "rgba(99, 102, 241, 0.32)",
    accentSuccess: "#4ade80",
    accentSuccessBg: "rgba(74, 222, 128, 0.08)",
    accentSuccessBorder: "rgba(74, 222, 128, 0.25)",
    accentWarning: "#fbbf24",
    accentWarningBg: "rgba(251, 191, 36, 0.08)",
    accentWarningBorder: "rgba(251, 191, 36, 0.25)",
    accentError: "#f87171",
    accentErrorBg: "rgba(248, 113, 113, 0.08)",
    accentErrorBorder: "rgba(248, 113, 113, 0.25)",
    accentCyan: "#38bdf8",
    accentCyanBg: "rgba(56, 189, 248, 0.08)",
    accentCyanBorder: "rgba(56, 189, 248, 0.25)",
    radiusSm: "4px",
    radiusMd: "6px",
    radiusLg: "8px",
    fontFamily: "inherit",
    gap: "6px",
};
export function createCard(title, badgeText, badgeColor) {
    const card = document.createElement("div");
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = THEME.gap;
    card.style.padding = "8px 10px";
    card.style.borderRadius = THEME.radiusMd;
    card.style.background = THEME.bgCard;
    card.style.border = `1px solid ${THEME.borderColor}`;
    card.style.boxSizing = "border-box";
    card.style.transition = "border-color 0.15s ease, box-shadow 0.15s ease";
    if (title) {
        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.paddingBottom = "4px";
        header.style.borderBottom = `1px solid ${THEME.borderColor}`;
        const titleEl = document.createElement("div");
        titleEl.textContent = title;
        titleEl.style.fontWeight = "600";
        titleEl.style.fontSize = "11px";
        titleEl.style.letterSpacing = "0.3px";
        titleEl.style.color = THEME.textColor;
        header.appendChild(titleEl);
        if (badgeText) {
            const badgeEl = createBadge(badgeText, badgeColor);
            header.appendChild(badgeEl);
        }
        card.appendChild(header);
    }
    return card;
}
export function createBadge(text, color = THEME.textMuted) {
    const badge = document.createElement("span");
    badge.textContent = text;
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.padding = "2px 6px";
    badge.style.borderRadius = THEME.radiusSm;
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "500";
    badge.style.lineHeight = "1";
    badge.style.color = color;
    badge.style.background = "rgba(255, 255, 255, 0.05)";
    badge.style.border = `1px solid ${THEME.borderColor}`;
    return badge;
}
export function createButton(text, variant = "secondary", icon) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mjr-ps-btn";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "5px";
    btn.style.padding = "6px 10px";
    btn.style.borderRadius = THEME.radiusSm;
    btn.style.fontSize = "11px";
    btn.style.fontWeight = "500";
    btn.style.cursor = "pointer";
    btn.style.lineHeight = "1.2";
    btn.style.whiteSpace = "nowrap";
    btn.style.transition = "all 0.15s ease";
    btn.style.boxSizing = "border-box";
    if (icon) {
        const iconEl = document.createElement("i");
        iconEl.className = icon;
        iconEl.style.fontSize = "11px";
        btn.appendChild(iconEl);
    }
    const textNode = document.createTextNode(text);
    btn.appendChild(textNode);
    if (variant === "primary") {
        btn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(59, 130, 246, 0.18) 100%)";
        btn.style.border = "1px solid rgba(129, 140, 248, 0.45)";
        btn.style.color = "#ffffff";
        btn.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.25)";
    }
    else if (variant === "danger") {
        btn.style.background = "rgba(239, 68, 68, 0.12)";
        btn.style.border = "1px solid rgba(239, 68, 68, 0.3)";
        btn.style.color = "#fca5a5";
    }
    else if (variant === "ghost") {
        btn.style.background = "transparent";
        btn.style.border = "1px solid transparent";
        btn.style.color = THEME.textMuted;
    }
    else {
        // secondary
        btn.style.background = "rgba(255, 255, 255, 0.04)";
        btn.style.border = `1px solid ${THEME.borderColor}`;
        btn.style.color = THEME.textColor;
    }
    btn.addEventListener("mouseenter", () => {
        if (btn.disabled)
            return;
        if (variant === "primary") {
            btn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.35) 0%, rgba(59, 130, 246, 0.28) 100%)";
            btn.style.borderColor = "rgba(165, 180, 252, 0.65)";
            btn.style.boxShadow = "0 2px 6px rgba(99, 102, 241, 0.25)";
        }
        else if (variant === "danger") {
            btn.style.background = "rgba(239, 68, 68, 0.2)";
            btn.style.borderColor = "rgba(239, 68, 68, 0.45)";
        }
        else if (variant === "ghost") {
            btn.style.background = "rgba(255, 255, 255, 0.05)";
            btn.style.color = "#ffffff";
        }
        else {
            btn.style.background = "rgba(255, 255, 255, 0.07)";
            btn.style.borderColor = "rgba(255, 255, 255, 0.18)";
        }
    });
    btn.addEventListener("mouseleave", () => {
        if (variant === "primary") {
            btn.style.background = "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(59, 130, 246, 0.18) 100%)";
            btn.style.borderColor = "rgba(129, 140, 248, 0.45)";
            btn.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.25)";
        }
        else if (variant === "danger") {
            btn.style.background = "rgba(239, 68, 68, 0.12)";
            btn.style.borderColor = "rgba(239, 68, 68, 0.3)";
        }
        else if (variant === "ghost") {
            btn.style.background = "transparent";
            btn.style.borderColor = "transparent";
            btn.style.color = THEME.textMuted;
        }
        else {
            btn.style.background = "rgba(255, 255, 255, 0.04)";
            btn.style.borderColor = THEME.borderColor;
        }
    });
    return btn;
}
export function createInput(placeholder = "", value = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value;
    input.style.width = "100%";
    input.style.boxSizing = "border-box";
    input.style.padding = "6px 8px";
    input.style.borderRadius = THEME.radiusSm;
    input.style.border = `1px solid ${THEME.borderColor}`;
    input.style.background = THEME.bgInput;
    input.style.color = THEME.textColor;
    input.style.fontSize = "12px";
    input.style.outline = "none";
    input.style.transition = "border-color 0.15s ease";
    input.addEventListener("focus", () => {
        input.style.borderColor = THEME.borderActive;
        input.style.boxShadow = "0 0 0 2px rgba(99, 102, 241, 0.2)";
    });
    input.addEventListener("blur", () => {
        input.style.borderColor = THEME.borderColor;
        input.style.boxShadow = "none";
    });
    return input;
}
export function createSelect(options = []) {
    const sel = document.createElement("select");
    sel.className = "mjr-ps-select";
    sel.style.width = "100%";
    sel.style.boxSizing = "border-box";
    sel.style.padding = "6px 8px";
    sel.style.borderRadius = THEME.radiusSm;
    sel.style.border = `1px solid ${THEME.borderColor}`;
    sel.style.background = THEME.bgInput;
    sel.style.color = THEME.textColor;
    sel.style.fontSize = "12px";
    sel.style.outline = "none";
    sel.style.cursor = "pointer";
    for (const opt of options) {
        const el = document.createElement("option");
        el.value = opt.value;
        el.textContent = opt.label;
        sel.appendChild(el);
    }
    return sel;
}
export function createRow(labelText, contentEl, tooltip) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "column";
    row.style.gap = "3px";
    const label = document.createElement("label");
    label.textContent = labelText;
    label.style.fontSize = "11px";
    label.style.fontWeight = "500";
    label.style.color = THEME.textMuted;
    if (tooltip)
        label.title = tooltip;
    row.appendChild(label);
    row.appendChild(contentEl);
    return row;
}
export function createSwitch(labelText, checked, onChange) {
    const wrap = document.createElement("label");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.cursor = "pointer";
    wrap.style.fontSize = "11px";
    wrap.style.color = THEME.textColor;
    wrap.style.userSelect = "none";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.style.accentColor = "var(--border-color, #71717a)";
    cb.style.cursor = "pointer";
    const span = document.createElement("span");
    span.textContent = labelText;
    span.style.opacity = "0.9";
    cb.addEventListener("change", () => {
        onChange?.(cb.checked);
    });
    wrap.appendChild(cb);
    wrap.appendChild(span);
    return wrap;
}
export function createDetails(titleText, defaultOpen = false) {
    const details = document.createElement("details");
    details.open = defaultOpen;
    details.style.display = "flex";
    details.style.flexDirection = "column";
    details.style.gap = THEME.gap;
    details.style.padding = "7px 9px";
    details.style.borderRadius = THEME.radiusMd;
    details.style.background = THEME.bgCard;
    details.style.border = `1px solid ${THEME.borderColor}`;
    details.style.transition = "border-color 0.15s ease";
    const summary = document.createElement("summary");
    summary.textContent = titleText;
    summary.style.cursor = "pointer";
    summary.style.fontSize = "11px";
    summary.style.fontWeight = "600";
    summary.style.letterSpacing = "0.3px";
    summary.style.color = THEME.textColor;
    summary.style.outline = "none";
    summary.style.userSelect = "none";
    details.appendChild(summary);
    details._summary = summary;
    return details;
}
export function createSegmentedControl(options, initialValue, onChange) {
    const container = document.createElement("div");
    container.style.display = "grid";
    container.style.gridTemplateColumns = `repeat(${options.length}, 1fr)`;
    container.style.gap = "2px";
    container.style.padding = "2px";
    container.style.borderRadius = THEME.radiusSm;
    container.style.background = "rgba(255, 255, 255, 0.04)";
    container.style.border = `1px solid ${THEME.borderColor}`;
    container.style.boxSizing = "border-box";
    let currentValue = initialValue;
    const buttons = new Map();
    const updateVisuals = () => {
        for (const [val, btn] of buttons.entries()) {
            const isSelected = val === currentValue;
            btn.style.background = isSelected
                ? "linear-gradient(180deg, rgba(99, 102, 241, 0.22) 0%, rgba(99, 102, 241, 0.1) 100%)"
                : "transparent";
            btn.style.borderColor = isSelected ? "rgba(129, 140, 248, 0.42)" : "transparent";
            btn.style.color = isSelected ? "#ffffff" : THEME.textMuted;
            btn.style.fontWeight = isSelected ? "600" : "400";
            btn.style.boxShadow = isSelected ? "0 1px 3px rgba(0, 0, 0, 0.25)" : "none";
        }
    };
    for (const opt of options) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "mjr-ps-btn";
        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.gap = "5px";
        btn.style.padding = "5px 8px";
        btn.style.borderRadius = "3px";
        btn.style.border = "1px solid transparent";
        btn.style.fontSize = "11px";
        btn.style.cursor = "pointer";
        btn.style.transition = "all 0.15s ease";
        btn.style.boxSizing = "border-box";
        if (opt.icon) {
            const iconEl = document.createElement("i");
            iconEl.className = opt.icon;
            iconEl.style.fontSize = "10px";
            btn.appendChild(iconEl);
        }
        const textNode = document.createTextNode(opt.label);
        btn.appendChild(textNode);
        btn.addEventListener("click", () => {
            if (currentValue !== opt.value) {
                currentValue = opt.value;
                updateVisuals();
                onChange(opt.value);
            }
        });
        buttons.set(opt.value, btn);
        container.appendChild(btn);
    }
    updateVisuals();
    return {
        element: container,
        setValue: (val) => {
            currentValue = val;
            updateVisuals();
        },
        getValue: () => currentValue,
    };
}
export function createStatusTile(label, initialValue, icon, initialColor = THEME.textColor) {
    const tile = document.createElement("div");
    tile.style.display = "flex";
    tile.style.flexDirection = "column";
    tile.style.gap = "2px";
    tile.style.padding = "6px 8px";
    tile.style.borderRadius = THEME.radiusSm;
    tile.style.background = "rgba(255, 255, 255, 0.02)";
    tile.style.border = `1px solid ${THEME.borderColor}`;
    tile.style.boxSizing = "border-box";
    tile.style.minWidth = "0";
    tile.style.transition = "background 0.15s ease, border-color 0.15s ease";
    const topRow = document.createElement("div");
    topRow.style.display = "flex";
    topRow.style.alignItems = "center";
    topRow.style.gap = "4px";
    topRow.style.fontSize = "10px";
    topRow.style.color = THEME.textMuted;
    topRow.style.fontWeight = "500";
    topRow.style.textTransform = "uppercase";
    topRow.style.letterSpacing = "0.3px";
    if (icon) {
        const iconEl = document.createElement("i");
        iconEl.className = icon;
        iconEl.style.fontSize = "9px";
        topRow.appendChild(iconEl);
    }
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    topRow.appendChild(labelEl);
    const valueEl = document.createElement("div");
    valueEl.style.fontSize = "11px";
    valueEl.style.fontWeight = "600";
    valueEl.style.color = initialColor;
    valueEl.style.whiteSpace = "nowrap";
    valueEl.style.overflow = "hidden";
    valueEl.style.textOverflow = "ellipsis";
    valueEl.textContent = initialValue;
    tile.appendChild(topRow);
    tile.appendChild(valueEl);
    return {
        element: tile,
        update: (value, color = THEME.textColor, subtitle) => {
            valueEl.textContent = value;
            valueEl.style.color = color;
            if (color === THEME.accentSuccess) {
                tile.style.background = "rgba(74, 222, 128, 0.05)";
                tile.style.borderColor = "rgba(74, 222, 128, 0.25)";
            }
            else if (color === THEME.accentWarning) {
                tile.style.background = "rgba(251, 191, 36, 0.05)";
                tile.style.borderColor = "rgba(251, 191, 36, 0.25)";
            }
            else if (color === THEME.accentError) {
                tile.style.background = "rgba(248, 113, 113, 0.05)";
                tile.style.borderColor = "rgba(248, 113, 113, 0.25)";
            }
            else {
                tile.style.background = "rgba(255, 255, 255, 0.02)";
                tile.style.borderColor = THEME.borderColor;
            }
            if (subtitle) {
                tile.title = `${label}: ${value} (${subtitle})`;
            }
            else {
                tile.title = `${label}: ${value}`;
            }
        },
    };
}
//# sourceMappingURL=theme.js.map