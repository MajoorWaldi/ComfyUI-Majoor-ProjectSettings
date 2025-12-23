import { ensureStyles } from "./toast.js";
import {
  extractFilenameFromUrl,
  getAllowedExtensions,
  hasAllowedExtension,
  isValidUrl,
} from "./model_downloader.js";

function formatRecipeText(recipe) {
  const parts = [];
  if (recipe?.url) parts.push(recipe.url);
  if (recipe?.filename) parts.push(`file: ${recipe.filename}`);
  if (recipe?.kind) parts.push(`kind: ${recipe.kind}`);
  if (recipe?.sha256) parts.push(`sha256: ${recipe.sha256}`);
  return parts.join(" | ");
}

export function showModelDownloaderDialog({ entries, kindOptions, existingMap } = {}) {
  ensureStyles();
  const items = Array.isArray(entries) ? entries : [];
  const kinds = Array.isArray(kindOptions) ? kindOptions : [];
  const existing = existingMap instanceof Map ? existingMap : null;

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(5, 6, 10, 0.75)";
    overlay.style.zIndex = "10010";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "16px";

    const panel = document.createElement("div");
    panel.style.width = "min(720px, 92vw)";
    panel.style.maxHeight = "80vh";
    panel.style.overflow = "auto";
    panel.style.background = "rgba(18, 20, 26, 0.95)";
    panel.style.border = "1px solid rgba(255,255,255,0.12)";
    panel.style.borderRadius = "12px";
    panel.style.padding = "14px 16px";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.gap = "10px";
    panel.style.color = "#eee";
    panel.style.fontSize = "12px";
    panel.style.boxShadow = "0 12px 32px rgba(0,0,0,0.4)";
    overlay.appendChild(panel);

    const title = document.createElement("div");
    title.textContent = "Download Missing Models";
    title.style.fontWeight = "600";
    title.style.fontSize = "13px";
    title.style.letterSpacing = "0.4px";
    panel.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = `Missing entries: ${items.length}`;
    subtitle.style.opacity = "0.8";
    subtitle.style.fontSize = "11px";
    panel.appendChild(subtitle);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";
    panel.appendChild(list);

    const rows = [];
    for (const entry of items) {
      const recipe = entry?.recipe || null;
      const isPrefilled = entry?.prefilled === true || !!recipe;
      const isNoteRecipe = recipe?.source === "workflow_note";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "6px";
      row.style.padding = "8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid rgba(255,255,255,0.08)";
      row.style.background = "rgba(12, 14, 18, 0.6)";
      const defaultBorder = row.style.border;
      const defaultBackground = row.style.background;

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.gap = "8px";

      const titleWrap = document.createElement("div");
      titleWrap.style.display = "flex";
      titleWrap.style.alignItems = "center";
      titleWrap.style.gap = "6px";
      const titleText = document.createElement("div");
      titleText.textContent = entry?.missing_value || entry?.key || "Missing model";
      titleText.style.fontWeight = "600";
      titleWrap.appendChild(titleText);

      if (isNoteRecipe) {
        const badge = document.createElement("span");
        badge.textContent = "From Workflow Note";
        badge.style.fontSize = "10px";
        badge.style.padding = "1px 6px";
        badge.style.borderRadius = "999px";
        badge.style.background = "rgba(46, 136, 255, 0.18)";
        badge.style.border = "1px solid rgba(46, 136, 255, 0.45)";
        badge.style.color = "#cfe3ff";
        titleWrap.appendChild(badge);
      }

      const downloadWrap = document.createElement("label");
      downloadWrap.style.display = "flex";
      downloadWrap.style.alignItems = "center";
      downloadWrap.style.gap = "6px";
      downloadWrap.style.cursor = "pointer";
      const downloadCb = document.createElement("input");
      downloadCb.type = "checkbox";
      downloadCb.checked = isPrefilled;
      const downloadText = document.createElement("span");
      downloadText.textContent = "Download";
      downloadText.style.opacity = "0.85";
      downloadWrap.appendChild(downloadCb);
      downloadWrap.appendChild(downloadText);

      header.appendChild(titleWrap);
      header.appendChild(downloadWrap);

      row.appendChild(header);
      const separator = document.createElement("div");
      separator.style.height = "1px";
      separator.style.background = "rgba(255,255,255,0.08)";
      separator.style.margin = "2px 0";
      row.appendChild(separator);

      const urlLabel = document.createElement("div");
      urlLabel.textContent = "URL";
      urlLabel.style.opacity = "0.8";
      urlLabel.style.fontSize = "10px";
      const urlField = document.createElement("input");
      urlField.type = "text";
      urlField.placeholder = "https://...";
      urlField.style.width = "100%";
      urlField.style.padding = "6px 8px";
      urlField.style.borderRadius = "8px";
      urlField.style.border = "1px solid rgba(255,255,255,0.12)";
      urlField.style.background = "rgba(0,0,0,0.25)";
      urlField.style.color = "#eee";

      const kindLabel = document.createElement("div");
      kindLabel.textContent = "Kind";
      kindLabel.style.opacity = "0.8";
      kindLabel.style.fontSize = "10px";
      const kindField = document.createElement("select");
      kindField.className = "mjr-ps-select";
      kindField.style.width = "100%";
      kindField.style.padding = "6px 8px";
      kindField.style.borderRadius = "8px";
      kindField.style.border = "1px solid rgba(255,255,255,0.12)";
      kindField.style.color = "#f2f4f8";
      for (const option of kinds) {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label || option.value;
        kindField.appendChild(opt);
      }

      const fileLabel = document.createElement("div");
      fileLabel.textContent = "Filename (optional)";
      fileLabel.style.opacity = "0.8";
      fileLabel.style.fontSize = "10px";
      const fileField = document.createElement("input");
      fileField.type = "text";
      fileField.placeholder = getAllowedExtensions().join(", ");
      fileField.style.width = "100%";
      fileField.style.padding = "6px 8px";
      fileField.style.borderRadius = "8px";
      fileField.style.border = "1px solid rgba(255,255,255,0.12)";
      fileField.style.background = "rgba(0,0,0,0.25)";
      fileField.style.color = "#eee";

      const shaLabel = document.createElement("div");
      shaLabel.textContent = "SHA256 (optional)";
      shaLabel.style.opacity = "0.8";
      shaLabel.style.fontSize = "10px";
      const shaField = document.createElement("input");
      shaField.type = "text";
      shaField.placeholder = "64 hex chars";
      shaField.style.width = "100%";
      shaField.style.padding = "6px 8px";
      shaField.style.borderRadius = "8px";
      shaField.style.border = "1px solid rgba(255,255,255,0.12)";
      shaField.style.background = "rgba(0,0,0,0.25)";
      shaField.style.color = "#eee";

      const grid = document.createElement("div");
      grid.style.display = "grid";
      grid.style.gridTemplateColumns = "1fr 1fr";
      grid.style.gap = "6px";

      const colLeft = document.createElement("div");
      colLeft.style.display = "flex";
      colLeft.style.flexDirection = "column";
      colLeft.style.gap = "4px";
      colLeft.appendChild(urlLabel);
      colLeft.appendChild(urlField);
      colLeft.appendChild(fileLabel);
      colLeft.appendChild(fileField);

      const colRight = document.createElement("div");
      colRight.style.display = "flex";
      colRight.style.flexDirection = "column";
      colRight.style.gap = "4px";
      colRight.appendChild(kindLabel);
      colRight.appendChild(kindField);
      colRight.appendChild(shaLabel);
      colRight.appendChild(shaField);

      grid.appendChild(colLeft);
      grid.appendChild(colRight);
      row.appendChild(grid);

      if (recipe) {
        const recipeLine = document.createElement("div");
        recipeLine.textContent = formatRecipeText(recipe);
        recipeLine.style.opacity = "0.75";
        recipeLine.style.fontSize = "10px";
        recipeLine.style.wordBreak = "break-word";
        row.appendChild(recipeLine);
      }

      if (recipe?.url) {
        urlField.value = recipe.url;
      }
      if (recipe?.filename) {
        fileField.value = recipe.filename;
      }
      if (recipe?.sha256) {
        shaField.value = recipe.sha256;
      }
      const setKindValue = (value) => {
        if (!value) return false;
        const exists = Array.from(kindField.options).some((opt) => opt.value === value);
        if (exists) {
          kindField.value = value;
          return true;
        }
        return false;
      };

      if (!setKindValue(recipe?.kind)) {
        setKindValue(entry?.kind);
      }

      let locked = isPrefilled;
      const setLocked = (value) => {
        locked = value;
        urlField.readOnly = locked;
        fileField.readOnly = locked;
        shaField.readOnly = locked;
        kindField.disabled = locked;
      };
      setLocked(isPrefilled);

      if (isNoteRecipe) {
        const editBtn = document.createElement("button");
        editBtn.textContent = "Edit";
        editBtn.className = "mjr-ps-btn";
        editBtn.style.padding = "2px 6px";
        editBtn.style.borderRadius = "6px";
        editBtn.style.border = "1px solid rgba(255,255,255,0.2)";
        editBtn.style.background = "rgba(255,255,255,0.06)";
        editBtn.style.color = "#eee";
        editBtn.style.cursor = "pointer";
        editBtn.addEventListener("click", () => {
          setLocked(!locked);
          editBtn.textContent = locked ? "Edit" : "Lock";
        });
        titleWrap.appendChild(editBtn);
      }

      const normalizeName = (value) => String(value || "").replace(/\\/g, "/").toLowerCase();
      const existsFor = (kind, filename) => {
        if (!existing || !kind || !filename) return false;
        const set = existing.get(kind);
        if (!set) return false;
        return set.has(normalizeName(filename));
      };

      const updateExistsHighlight = () => {
        const kind = String(kindField.value || "").trim();
        const filename = String(fileField.value || extractFilenameFromUrl(urlField.value || "") || "").trim();
        if (!filename) {
          row.style.border = defaultBorder;
          row.style.background = defaultBackground;
          return;
        }
        if (existsFor(kind, filename)) {
          row.style.border = "1px solid rgba(47, 143, 78, 0.7)";
          row.style.background = "rgba(47, 143, 78, 0.12)";
        } else {
          row.style.border = defaultBorder;
          row.style.background = defaultBackground;
        }
      };

      urlField.addEventListener("input", updateExistsHighlight);
      fileField.addEventListener("input", updateExistsHighlight);
      kindField.addEventListener("change", updateExistsHighlight);
      updateExistsHighlight();

      list.appendChild(row);
      rows.push({
        entry,
        downloadCb,
        urlInput: urlField,
        kindSelect: kindField,
        filenameInput: fileField,
        shaInput: shaField,
      });
    }

    const rememberWrap = document.createElement("label");
    rememberWrap.style.display = "flex";
    rememberWrap.style.alignItems = "center";
    rememberWrap.style.gap = "6px";
    rememberWrap.style.cursor = "pointer";
    const rememberCb = document.createElement("input");
    rememberCb.type = "checkbox";
    rememberCb.checked = true;
    const rememberText = document.createElement("span");
    rememberText.textContent = "Remember these sources";
    rememberText.style.opacity = "0.85";
    rememberWrap.appendChild(rememberCb);
    rememberWrap.appendChild(rememberText);
    panel.appendChild(rememberWrap);

    const errorText = document.createElement("div");
    errorText.style.color = "#f2a5a5";
    errorText.style.fontSize = "11px";
    errorText.style.minHeight = "14px";
    panel.appendChild(errorText);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.justifyContent = "flex-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "mjr-ps-btn";
    cancelBtn.style.padding = "6px 10px";
    cancelBtn.style.borderRadius = "8px";
    cancelBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    cancelBtn.style.background = "rgba(255,255,255,0.06)";
    cancelBtn.style.color = "#eee";
    cancelBtn.style.cursor = "pointer";

    const downloadBtn = document.createElement("button");
    downloadBtn.textContent = "Download Selected";
    downloadBtn.className = "mjr-ps-btn";
    downloadBtn.style.padding = "6px 10px";
    downloadBtn.style.borderRadius = "8px";
    downloadBtn.style.border = "1px solid rgba(46, 136, 255, 0.65)";
    downloadBtn.style.background = "rgba(46, 136, 255, 0.25)";
    downloadBtn.style.color = "#eee";
    downloadBtn.style.cursor = "pointer";

    actions.appendChild(cancelBtn);
    actions.appendChild(downloadBtn);
    panel.appendChild(actions);

    const close = (value) => {
      document.removeEventListener("keydown", onKeyDown);
      if (overlay.parentNode) overlay.remove();
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (String(event.key || "").toLowerCase() === "escape") {
        event.preventDefault();
        close(null);
      }
    };

    downloadBtn.addEventListener("click", () => {
      errorText.textContent = "";
      const downloadItems = [];
      const saveItems = [];
      for (const row of rows) {
        if (!row.downloadCb.checked) continue;
        const entry = row.entry || {};
        const url = String(row.urlInput?.value || "").trim();
        const kind = String(row.kindSelect?.value || "").trim();
        const filenameRaw = String(row.filenameInput?.value || "").trim();
        const shaRaw = String(row.shaInput?.value || "").trim().toLowerCase();

        if (!url || !isValidUrl(url)) {
          errorText.textContent = "Please provide a valid http/https URL.";
          return;
        }

        const filename = filenameRaw || extractFilenameFromUrl(url);
        if (!filename || !hasAllowedExtension(filename)) {
          errorText.textContent = "Filename must use a supported extension.";
          return;
        }

        if (!kind) {
          errorText.textContent = "Please select a valid kind.";
          return;
        }

        if (shaRaw && !/^[0-9a-f]{64}$/.test(shaRaw)) {
          errorText.textContent = "SHA256 must be 64 hex characters.";
          return;
        }

        const item = {
          key: entry.key,
          kind,
          url,
          filename,
          sha256: shaRaw || null,
        };
        downloadItems.push(item);
        if (rememberCb.checked) {
          saveItems.push(item);
        }
      }

      if (!downloadItems.length) {
        errorText.textContent = "Select at least one item to download.";
        return;
      }

      close({
        items: downloadItems,
        saveItems,
        remember: rememberCb.checked,
      });
    });

    cancelBtn.addEventListener("click", () => close(null));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close(null);
      }
    });
    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(overlay);
  });
}
