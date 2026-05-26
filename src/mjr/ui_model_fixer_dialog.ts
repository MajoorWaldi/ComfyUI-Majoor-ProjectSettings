import { ensureStyles } from "./toast.js";

function buildResultMap(results) {
  const map = new Map();
  for (const entry of results || []) {
    const missingValue = String(entry?.missing_value || "");
    const typeHint = String(entry?.type_hint || "unknown");
    const key = `${missingValue}::${typeHint}`;
    map.set(key, {
      candidates: Array.isArray(entry?.candidates) ? entry.candidates : [],
      exact_match_wrong_folder: entry?.exact_match_wrong_folder || null,
    });
  }
  return map;
}

function formatCandidateLabel(candidate) {
  const score = Number(candidate?.score || 0);
  const basename = String(candidate?.basename || candidate?.relpath || "");
  const kind = String(candidate?.kind || "");
  if (kind) {
    return `${score} | ${basename} (${kind})`;
  }
  return `${score} | ${basename}`;
}

export function showModelFixerDialog({ missing, results } = {}) {
  ensureStyles();
  const missingList = Array.isArray(missing) ? missing : [];
  const resultMap = buildResultMap(results);

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
    panel.style.width = "min(640px, 92vw)";
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
    title.textContent = "Fix Missing Models";
    title.style.fontWeight = "600";
    title.style.fontSize = "13px";
    title.style.letterSpacing = "0.4px";
    panel.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.textContent = `Missing entries: ${missingList.length}`;
    subtitle.style.opacity = "0.8";
    subtitle.style.fontSize = "11px";
    panel.appendChild(subtitle);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "8px";
    panel.appendChild(list);

    const rows = [];
    for (const entry of missingList) {
      const missingValue = String(entry?.missing_value || "");
      const typeHint = String(entry?.type_hint || "unknown");
      const key = `${missingValue}::${typeHint}`;
      const resultData = resultMap.get(key) || { candidates: [], exact_match_wrong_folder: null };
      const candidates = resultData.candidates || [];
      const wrongFolderMatch = resultData.exact_match_wrong_folder;
      const exactMatches = candidates.filter((c) => Number(c?.score || 0) === 100);
      const exactUnique = exactMatches.length === 1;

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "6px";
      row.style.padding = "8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid rgba(255,255,255,0.08)";
      row.style.background = "rgba(12, 14, 18, 0.6)";

      const label = document.createElement("div");
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      const titleText = document.createElement("div");
      const nodeLabel = entry?.node_title || `Node ${entry?.node_id ?? "?"}`;
      const widgetLabel = entry?.widget_name || "widget";
      titleText.textContent = `${nodeLabel} - ${widgetLabel}`;
      titleText.style.fontWeight = "600";
      const autoTag = document.createElement("span");
      if (exactUnique) {
        autoTag.textContent = "auto";
        autoTag.style.fontSize = "10px";
        autoTag.style.padding = "1px 6px";
        autoTag.style.borderRadius = "999px";
        autoTag.style.background = "rgba(46, 136, 255, 0.25)";
        autoTag.style.border = "1px solid rgba(46, 136, 255, 0.45)";
        autoTag.style.color = "#cfe3ff";
      }
      label.appendChild(titleText);
      if (exactUnique) {
        label.appendChild(autoTag);
      }

      const missingLine = document.createElement("div");
      missingLine.textContent = `Missing: ${missingValue}`;
      missingLine.style.opacity = "0.8";
      missingLine.style.fontSize = "11px";

      // Show "Move to correct folder" button if exact match found in wrong folder
      let moveButton = null;
      if (wrongFolderMatch) {
        const moveContainer = document.createElement("div");
        moveContainer.style.display = "flex";
        moveContainer.style.alignItems = "center";
        moveContainer.style.gap = "8px";
        moveContainer.style.padding = "6px 8px";
        moveContainer.style.borderRadius = "8px";
        moveContainer.style.background = "rgba(255, 165, 0, 0.15)";
        moveContainer.style.border = "1px solid rgba(255, 165, 0, 0.3)";

        const moveInfo = document.createElement("div");
        moveInfo.style.flex = "1";
        moveInfo.style.fontSize = "11px";
        moveInfo.style.color = "#ffb74d";
        moveInfo.textContent = `Found in ${wrongFolderMatch.kind}/ → Move to ${wrongFolderMatch.expected_kind}/`;

        moveButton = document.createElement("button");
        moveButton.textContent = "Move";
        moveButton.className = "mjr-ps-btn";
        moveButton.style.padding = "4px 10px";
        moveButton.style.borderRadius = "6px";
        moveButton.style.border = "1px solid rgba(255, 165, 0, 0.5)";
        moveButton.style.background = "rgba(255, 165, 0, 0.25)";
        moveButton.style.color = "#ffcc80";
        moveButton.style.cursor = "pointer";
        moveButton.style.fontSize = "11px";
        moveButton.dataset.sourceKind = wrongFolderMatch.kind;
        moveButton.dataset.sourceRelpath = wrongFolderMatch.relpath;
        moveButton.dataset.targetKind = wrongFolderMatch.expected_kind;

        moveContainer.appendChild(moveInfo);
        moveContainer.appendChild(moveButton);
        row.appendChild(label);
        row.appendChild(missingLine);
        row.appendChild(moveContainer);
      } else {
        row.appendChild(label);
        row.appendChild(missingLine);
      }

      const select = document.createElement("select");
      select.className = "mjr-ps-select";
      select.style.width = "100%";
      select.style.padding = "6px 8px";
      select.style.borderRadius = "8px";
      select.style.border = "1px solid rgba(255,255,255,0.12)";
      select.style.color = "#f2f4f8";

      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = candidates.length ? "-- Select match --" : "No candidates found";
      select.appendChild(emptyOpt);

      for (const candidate of candidates) {
        const opt = document.createElement("option");
        opt.value = String(candidate?.relpath || "");
        opt.textContent = formatCandidateLabel(candidate);
        opt.title = String(candidate?.relpath || "");
        select.appendChild(opt);
      }
      if (exactUnique) {
        select.value = String(exactMatches[0]?.relpath || "");
      }
      if (!candidates.length) {
        select.disabled = true;
        select.style.opacity = "0.6";
      }

      row.appendChild(select);
      list.appendChild(row);

      rows.push({
        node_id: entry?.node_id,
        widget_name: entry?.widget_name,
        select,
        moveButton,
      });
    }

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.justifyContent = "flex-end";
    actions.style.marginTop = "6px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "mjr-ps-btn";
    cancelBtn.style.padding = "6px 10px";
    cancelBtn.style.borderRadius = "8px";
    cancelBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    cancelBtn.style.background = "rgba(255,255,255,0.06)";
    cancelBtn.style.color = "#eee";
    cancelBtn.style.cursor = "pointer";

    const applyBtn = document.createElement("button");
    applyBtn.textContent = "Apply Fix";
    applyBtn.className = "mjr-ps-btn";
    applyBtn.style.padding = "6px 10px";
    applyBtn.style.borderRadius = "8px";
    applyBtn.style.border = "1px solid rgba(46, 136, 255, 0.65)";
    applyBtn.style.background = "rgba(46, 136, 255, 0.25)";
    applyBtn.style.color = "#eee";
    applyBtn.style.cursor = "pointer";

    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);
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

    // Add event listeners to all move buttons
    for (const row of rows) {
      if (row.moveButton) {
        row.moveButton.addEventListener("click", async () => {
          const button = row.moveButton;
          const sourceKind = button.dataset.sourceKind;
          const sourceRelpath = button.dataset.sourceRelpath;
          const targetKind = button.dataset.targetKind;

          button.disabled = true;
          button.textContent = "Moving...";

          try {
            const response = await fetch("/mjr_models/move_to_correct_folder", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source_kind: sourceKind,
                source_relpath: sourceRelpath,
                target_kind: targetKind,
              }),
            });

            const data = await response.json();

            if (data.ok) {
              button.textContent = "Moved!";
              button.style.background = "rgba(76, 175, 80, 0.25)";
              button.style.border = "1px solid rgba(76, 175, 80, 0.5)";
              button.style.color = "#a5d6a7";

              // Auto-select the newly moved file in the dropdown
              if (row.select && data.target_relpath) {
                row.select.value = data.target_relpath;
              }

              // Refresh the folder to show the new file
              setTimeout(() => {
                if (typeof app?.refreshComboInNodes === "function") {
                  app.refreshComboInNodes();
                }
              }, 500);
            } else {
              throw new Error(data.error || "Move failed");
            }
          } catch (error) {
            console.error("[mjr] Failed to move model:", error);
            button.textContent = "Error";
            button.style.background = "rgba(244, 67, 54, 0.25)";
            button.style.border = "1px solid rgba(244, 67, 54, 0.5)";
            button.disabled = false;
            setTimeout(() => {
              button.textContent = "Move";
              button.style.background = "rgba(255, 165, 0, 0.25)";
              button.style.border = "1px solid rgba(255, 165, 0, 0.5)";
            }, 3000);
          }
        });
      }
    }

    applyBtn.addEventListener("click", () => {
      const fixes = [];
      for (const row of rows) {
        const value = row.select.value;
        if (!value) continue;
        fixes.push({
          node_id: row.node_id,
          widget_name: row.widget_name,
          new_value: value,
        });
      }
      close(fixes);
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
