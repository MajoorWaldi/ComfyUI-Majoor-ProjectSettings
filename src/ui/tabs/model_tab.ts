/**
 * Model Tab component for Majoor Project Settings.
 * Handles active model selection, custom model tagging, community registry search,
 * and missing models repair/download utilities.
 */

import { app } from "../../../../scripts/app.js";
import { toast } from "../../mjr/toast.js";
import { psConfirm } from "../../mjr/dialog.js";
import { getSerializedWorkflow } from "../../mjr/graph.js";
import {
  buildFingerprintCache,
  getFingerprintCacheStatus,
  getModels,
  searchRegistry,
  downloadModels,
  getDownloadStatus,
  resolveModelRecipes,
  saveModelRecipes,
  scanModelCandidates,
  fetchJSON,
} from "../../mjr/api.js";
import {
  scanMissingModelsFromGraph,
  scanMissingModelsWithStats,
  applyFixesToGraph,
} from "../../mjr/model_fixer.js";
import {
  getKindOptions,
  typeHintToKind,
  normalizeKey,
  collectNoteRecipes,
} from "../../mjr/model_downloader.js";
import { showModelFixerDialog, type ModelFixerResult } from "../../mjr/ui_model_fixer_dialog.js";
import { showModelDownloaderDialog } from "../../mjr/ui_model_downloader_dialog.js";
import { showModelContributionDialog } from "../../mjr/model_contribution_dialog.js";
import { saveState } from "../../state_manager.js";
import { resolveModel } from "../../mjr/utils.js";
import type { RuntimeState } from "../../types/domain.js";
import {
  createCard,
  createButton,
  createInput,
  createSelect,
  createRow,
  createSwitch,
  createDetails,
  createBadge,
  THEME,
} from "../theme.js";

export interface ModelTabContext {
  state: RuntimeState;
  updateUI: () => void;
  updateHealth: () => void;
  fixerState: {
    missing: number;
    fixed: number;
    total: number;
    cacheCount: number;
    cacheUpdatedAt: string;
    cacheError: string;
    scanned: boolean;
    lastScanToken: number;
  };
}

export function buildModelTab(ctx: ModelTabContext): {
  element: HTMLElement;
  refreshMissingStatus: () => void;
  updateModelSection: () => void;
} {
  const { state, updateUI, updateHealth, fixerState } = ctx;

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = THEME.gap;

  // -------------------------------------------------------------
  // 1. Model Configuration Card
  // -------------------------------------------------------------
  const modelCard = createCard("Model Configuration");

  const customInput = createInput("Custom model name", state.customModelText || "");
  const customTagPreview = document.createElement("div");
  customTagPreview.style.fontSize = "10px";
  customTagPreview.style.color = THEME.primaryColor;
  customTagPreview.textContent = "Tag: -";

  const customWrap = document.createElement("div");
  customWrap.style.display = state.useCustomModel ? "flex" : "none";
  customWrap.style.flexDirection = "column";
  customWrap.style.gap = "4px";
  customWrap.appendChild(createRow("Custom Model Name", customInput));
  customWrap.appendChild(customTagPreview);

  const customModelSwitch = createSwitch("Use custom model (UPPERCASE)", state.useCustomModel === true, (checked) => {
    state.useCustomModel = checked;
    if (checked && !state.customModelText) {
      state.customModelText = state.detectedModelTag || "";
      customInput.value = state.customModelText;
    }
    customWrap.style.display = checked ? "flex" : "none";
    saveState(state);
    updateTagPreview();
    updateUI();
  });

  const detectedRow = document.createElement("div");
  detectedRow.style.display = "flex";
  detectedRow.style.alignItems = "center";
  detectedRow.style.justifyContent = "space-between";
  detectedRow.style.gap = "6px";

  const detectedLabel = document.createElement("div");
  detectedLabel.style.fontSize = "11px";
  detectedLabel.style.color = THEME.accentWarning;
  detectedLabel.textContent = `Detected in workflow: ${state.detectedModelTag || "None"}`;

  const useDetectedBtn = createButton("Use as Custom", "secondary", "pi pi-copy");
  useDetectedBtn.style.padding = "2px 6px";
  useDetectedBtn.style.fontSize = "9px";
  useDetectedBtn.style.display = state.detectedModelTag ? "inline-flex" : "none";
  useDetectedBtn.addEventListener("click", () => {
    if (!state.detectedModelTag) return;
    state.useCustomModel = true;
    state.customModelText = state.detectedModelTag;
    customInput.value = state.customModelText;
    const cb = customModelSwitch.querySelector<HTMLInputElement>("input[type='checkbox']");
    if (cb) cb.checked = true;
    customWrap.style.display = "flex";
    saveState(state);
    updateTagPreview();
    updateUI();
    toast("info", "Custom Model", `Set to ${state.detectedModelTag}`);
  });

  detectedRow.appendChild(detectedLabel);
  detectedRow.appendChild(useDetectedBtn);

  const modelSelect = createSelect([{ value: "", label: "Loading models..." }]);
  const modelToggleBtn = createButton(state.showMoreModels ? "Fewer" : "More", "secondary");
  modelToggleBtn.style.padding = "4px 8px";
  modelToggleBtn.style.fontSize = "10px";

  const modelRow = document.createElement("div");
  modelRow.style.display = "flex";
  modelRow.style.gap = "6px";
  modelRow.style.alignItems = "flex-end";

  const modelSelectWrap = createRow("Default Model", modelSelect);
  modelSelectWrap.style.flex = "1";
  modelRow.appendChild(modelSelectWrap);
  modelRow.appendChild(modelToggleBtn);



  const updateTagPreview = () => {
    const raw = (state.customModelText || "").trim();
    if (!raw) {
      customTagPreview.textContent = "Tag: -";
    } else {
      const tag = raw.replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
      customTagPreview.textContent = `Tag: ${tag}`;
    }
  };
  updateTagPreview();

  customInput.addEventListener("input", () => {
    state.customModelText = customInput.value;
    saveState(state);
    updateTagPreview();
  });

  const loadModelsList = () => {
    getModels()
      .then((resp) => {
        const cats = (resp.categories || {}) as Record<string, string[]>;
        const priority = cats.diffusion_models?.length ? cats.diffusion_models : cats.checkpoints || [];
        const extra: string[] = [];
        for (const [key, list] of Object.entries(cats)) {
          if (key !== "diffusion_models" && key !== "checkpoints" && Array.isArray(list)) {
            extra.push(...(list as string[]));
          }
        }

        const toShow = state.showMoreModels ? [...priority, ...extra] : priority;
        modelSelect.innerHTML = "";

        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "Default (use detected)";
        modelSelect.appendChild(defaultOpt);

        for (const m of toShow) {
          const opt = document.createElement("option");
          opt.value = m;
          opt.textContent = m;
          modelSelect.appendChild(opt);
        }

        if (state.modelSelection) {
          modelSelect.value = state.modelSelection;
        }
      })
      .catch((err) => {
        console.warn("[mjr] Failed to fetch models:", err);
      });
  };

  modelToggleBtn.addEventListener("click", () => {
    state.showMoreModels = !state.showMoreModels;
    modelToggleBtn.textContent = state.showMoreModels ? "Fewer" : "More";
    saveState(state);
    loadModelsList();
  });

  modelSelect.addEventListener("change", () => {
    state.modelSelection = modelSelect.value;
    saveState(state);
    updateUI();
  });

  modelCard.appendChild(detectedRow);
  modelCard.appendChild(customModelSwitch);
  modelCard.appendChild(modelRow);
  modelCard.appendChild(customWrap);

  loadModelsList();

  // -------------------------------------------------------------
  // 2. Missing Models Scanner & Fix Utilities
  // -------------------------------------------------------------
  const fixerCard = createCard("Missing Models Utilities");

  const fixerStatusBadge = createBadge("Not scanned", THEME.textMuted);
  const fixerHeader = document.createElement("div");
  fixerHeader.style.display = "flex";
  fixerHeader.style.alignItems = "center";
  fixerHeader.style.justifyContent = "space-between";
  fixerHeader.style.fontSize = "11px";
  fixerHeader.appendChild(document.createTextNode("Workflow Status:"));
  fixerHeader.appendChild(fixerStatusBadge);

  const scanBtn = createButton("Scan Graph", "secondary", "pi pi-search");

  const fixBtn = createButton("Fix Missing", "primary", "pi pi-check-circle");
  fixBtn.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.15) 100%)";
  fixBtn.style.borderColor = "rgba(52, 211, 153, 0.45)";
  fixBtn.style.color = "#d1fae5";

  const downloadBtn = createButton("Download Missing", "primary", "pi pi-download");
  downloadBtn.style.background = "linear-gradient(135deg, rgba(56, 189, 248, 0.22) 0%, rgba(37, 99, 235, 0.15) 100%)";
  downloadBtn.style.borderColor = "rgba(56, 189, 248, 0.45)";
  downloadBtn.style.color = "#e0f2fe";

  const fixerBtnGrid = document.createElement("div");
  fixerBtnGrid.style.display = "grid";
  fixerBtnGrid.style.gridTemplateColumns = "1fr 1fr";
  fixerBtnGrid.style.gap = "6px";
  fixerBtnGrid.appendChild(scanBtn);
  fixerBtnGrid.appendChild(fixBtn);

  // Scan Results list container (inspired by ComfyUI workflow overview)
  const scanResultsWrap = document.createElement("div");
  scanResultsWrap.style.display = "flex";
  scanResultsWrap.style.flexDirection = "column";
  scanResultsWrap.style.gap = "8px";
  scanResultsWrap.style.marginTop = "4px";

  let lastScanCandidates: ModelFixerResult[] = [];
  let lastFoundOnDiskCount = 0;

  const refreshMissingStatus = async () => {
    try {
      const { missing, total } = scanMissingModelsWithStats();
      fixerState.scanned = true;
      fixerState.missing = missing.length;
      fixerState.total = total;

      if (total === 0) {
        fixerStatusBadge.textContent = "No model widgets";
        fixerStatusBadge.style.color = THEME.textMuted;
        scanResultsWrap.innerHTML = "";
        lastScanCandidates = [];
        lastFoundOnDiskCount = 0;
        updateHealth();
        return;
      }

      if (missing.length === 0) {
        fixerStatusBadge.textContent = "All models found";
        fixerStatusBadge.style.color = THEME.accentSuccess;
        fixerStatusBadge.style.background = "rgba(74, 222, 128, 0.08)";
        fixerStatusBadge.style.borderColor = "rgba(74, 222, 128, 0.2)";
        scanResultsWrap.innerHTML = "";
        lastScanCandidates = [];
        lastFoundOnDiskCount = 0;
        updateHealth();
        return;
      }

      // Query candidate models from disk across ComfyUI folders
      let candidateResults: ModelFixerResult[] = [];
      try {
        const resp = await scanModelCandidates(missing);
        candidateResults = (resp?.results as ModelFixerResult[]) || [];
        lastScanCandidates = candidateResults;
      } catch (err) {
        console.warn("[mjr] Failed to scan candidates from backend:", err);
      }

      const resultMap = new Map<string, { candidates: any[]; exact_match_wrong_folder: any }>();
      for (const res of candidateResults) {
        const key = `${res.missing_value || ""}::${res.type_hint || "unknown"}`;
        resultMap.set(key, {
          candidates: res.candidates || [],
          exact_match_wrong_folder: res.exact_match_wrong_folder || null,
        });
      }

      interface AnalyzedModelItem {
        entry: typeof missing[0];
        status: "found_on_disk" | "wrong_folder" | "missing";
        targetPath: string | null;
        wrongFolder: any | null;
      }

      const analyzedList: AnalyzedModelItem[] = [];
      let foundOnDiskCount = 0;

      for (const item of missing) {
        const key = `${item.missing_value}::${item.type_hint || "unknown"}`;
        const resData = resultMap.get(key) || { candidates: [], exact_match_wrong_folder: null };
        const candidates = resData.candidates || [];
        const wrongFolder = resData.exact_match_wrong_folder;

        // Check 1: In-options subfolder match detected during graph scan
        if (item.suggested_fix || item.found_on_disk_path) {
          analyzedList.push({
            entry: item,
            status: "found_on_disk",
            targetPath: String(item.suggested_fix || item.found_on_disk_path),
            wrongFolder: null,
          });
          foundOnDiskCount++;
          continue;
        }

        // Check 2: Exact match on disk from scan_candidates
        const exactMatch = candidates.find((c: any) => Number(c.score || 0) === 100);
        if (exactMatch && !exactMatch.in_wrong_folder) {
          analyzedList.push({
            entry: item,
            status: "found_on_disk",
            targetPath: String(exactMatch.relpath || exactMatch.basename),
            wrongFolder: null,
          });
          foundOnDiskCount++;
          continue;
        }

        // Check 3: Found in wrong folder on disk
        if (wrongFolder) {
          analyzedList.push({
            entry: item,
            status: "wrong_folder",
            targetPath: String(wrongFolder.relpath || wrongFolder.basename),
            wrongFolder,
          });
          foundOnDiskCount++;
          continue;
        }

        // Check 4: Missing from disk
        analyzedList.push({
          entry: item,
          status: "missing",
          targetPath: null,
          wrongFolder: null,
        });
      }

      lastFoundOnDiskCount = foundOnDiskCount;

      // Update header badge
      if (foundOnDiskCount > 0) {
        fixerStatusBadge.textContent = `${missing.length} missing (${foundOnDiskCount} found on disk)`;
        fixerStatusBadge.style.color = THEME.accentWarning;
        fixerStatusBadge.style.background = "rgba(251, 191, 36, 0.08)";
        fixerStatusBadge.style.borderColor = "rgba(251, 191, 36, 0.2)";
      } else {
        fixerStatusBadge.textContent = `${missing.length} missing / ${total}`;
        fixerStatusBadge.style.color = THEME.accentError;
        fixerStatusBadge.style.background = "rgba(239, 68, 68, 0.08)";
        fixerStatusBadge.style.borderColor = "rgba(239, 68, 68, 0.2)";
      }

      // Render scan results list
      scanResultsWrap.innerHTML = "";

      const summaryBar = document.createElement("div");
      summaryBar.style.display = "flex";
      summaryBar.style.alignItems = "center";
      summaryBar.style.justifyContent = "space-between";
      summaryBar.style.padding = "6px 8px";
      summaryBar.style.borderRadius = THEME.radiusSm;
      summaryBar.style.background = "rgba(255, 255, 255, 0.03)";
      summaryBar.style.border = `1px solid ${THEME.borderColor}`;

      const summaryText = document.createElement("div");
      summaryText.style.fontSize = "11px";
      summaryText.style.color = THEME.textColor;
      summaryText.textContent = `${missing.length} missing model(s) detected:`;

      summaryBar.appendChild(summaryText);

      if (foundOnDiskCount > 0) {
        const fixAllBtn = createButton(`Fix All Found (${foundOnDiskCount})`, "primary", "pi pi-check-circle");
        fixAllBtn.style.padding = "3px 8px";
        fixAllBtn.style.fontSize = "10px";
        fixAllBtn.addEventListener("click", async () => {
          const fixesToApply: Array<{ node_id: unknown; widget_name: unknown; new_value: unknown }> = [];
          for (const a of analyzedList) {
            if (a.status === "found_on_disk" && a.targetPath) {
              fixesToApply.push({
                node_id: a.entry.node_id,
                widget_name: a.entry.widget_name,
                new_value: a.targetPath,
              });
            } else if (a.status === "wrong_folder" && a.wrongFolder) {
              try {
                const moveData = await fetchJSON<{ ok: boolean; target_relpath?: string }>("/mjr_models/move_to_correct_folder", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    source_kind: a.wrongFolder.kind,
                    source_relpath: a.wrongFolder.relpath,
                    target_kind: a.wrongFolder.expected_kind,
                  }),
                });
                if (moveData?.ok && moveData.target_relpath) {
                  fixesToApply.push({
                    node_id: a.entry.node_id,
                    widget_name: a.entry.widget_name,
                    new_value: moveData.target_relpath,
                  });
                }
              } catch (_) {}
            }
          }
          if (fixesToApply.length > 0) {
            const count = applyFixesToGraph(fixesToApply);
            toast("success", "Models Fixed", `Applied ${count} fix(es) to graph.`);
            await refreshMissingStatus();
          }
        });
        summaryBar.appendChild(fixAllBtn);
      }

      scanResultsWrap.appendChild(summaryBar);

      const itemsList = document.createElement("div");
      itemsList.style.display = "flex";
      itemsList.style.flexDirection = "column";
      itemsList.style.gap = "6px";
      itemsList.style.maxHeight = "220px";
      itemsList.style.overflowY = "auto";

      for (const item of analyzedList) {
        const row = document.createElement("div");
        row.style.padding = "6px 8px";
        row.style.borderRadius = THEME.radiusSm;
        row.style.background = "rgba(12, 14, 18, 0.6)";
        row.style.border = "1px solid rgba(255, 255, 255, 0.08)";
        row.style.display = "flex";
        row.style.flexDirection = "column";
        row.style.gap = "4px";

        // Top line: Node title + widget name + crosshair focus button
        const topRow = document.createElement("div");
        topRow.style.display = "flex";
        topRow.style.alignItems = "center";
        topRow.style.justifyContent = "space-between";

        const nodeTitle = document.createElement("span");
        nodeTitle.style.fontWeight = "600";
        nodeTitle.style.fontSize = "11px";
        nodeTitle.style.color = THEME.textColor;
        nodeTitle.textContent = `${item.entry.node_title} · ${item.entry.widget_name}`;

        // Focus crosshair icon (centers on node in canvas)
        const focusBtn = document.createElement("button");
        focusBtn.className = "mjr-ps-btn";
        focusBtn.title = "Focus node in canvas";
        focusBtn.style.padding = "2px 6px";
        focusBtn.style.fontSize = "10px";
        focusBtn.style.background = "transparent";
        focusBtn.style.border = "none";
        focusBtn.style.color = THEME.textMuted;
        focusBtn.style.cursor = "pointer";
        focusBtn.innerHTML = `<i class="pi pi-crosshairs"></i>`;
        focusBtn.addEventListener("click", () => {
          const targetNode = item.entry.node || (item.entry.node_id != null ? (app?.graph as any)?.getNodeById(item.entry.node_id) : null);
          if (targetNode) {
            if (typeof (app?.canvas as any)?.centerOnNode === "function") {
              (app.canvas as any).centerOnNode(targetNode);
            }
            if (typeof (app?.canvas as any)?.selectNode === "function") {
              (app.canvas as any).selectNode(targetNode, false);
            }
            if (typeof app?.graph?.setDirtyCanvas === "function") {
              app.graph.setDirtyCanvas(true, true);
            }
          }
        });

        topRow.appendChild(nodeTitle);
        topRow.appendChild(focusBtn);

        // Model name
        const modelNameText = document.createElement("div");
        modelNameText.style.fontSize = "11px";
        modelNameText.style.fontFamily = "monospace";
        modelNameText.style.color = THEME.primaryColor;
        modelNameText.style.wordBreak = "break-all";
        modelNameText.textContent = item.entry.missing_value;

        // Bottom line: status pill + action button
        const bottomRow = document.createElement("div");
        bottomRow.style.display = "flex";
        bottomRow.style.alignItems = "center";
        bottomRow.style.justifyContent = "space-between";
        bottomRow.style.gap = "6px";
        bottomRow.style.marginTop = "2px";

        const statusTag = document.createElement("span");
        statusTag.style.fontSize = "10px";
        statusTag.style.padding = "1px 6px";
        statusTag.style.borderRadius = "4px";

        if (item.status === "found_on_disk") {
          statusTag.textContent = `Found on disk: ${item.targetPath}`;
          statusTag.style.background = "rgba(74, 222, 128, 0.15)";
          statusTag.style.border = "1px solid rgba(74, 222, 128, 0.35)";
          statusTag.style.color = "#a7f3d0";

          const singleFixBtn = createButton("Fix", "primary", "pi pi-check");
          singleFixBtn.style.padding = "2px 8px";
          singleFixBtn.style.fontSize = "10px";
          singleFixBtn.addEventListener("click", async () => {
            if (item.targetPath) {
              const count = applyFixesToGraph([{
                node_id: item.entry.node_id,
                widget_name: item.entry.widget_name,
                new_value: item.targetPath,
              }]);
              if (count > 0) {
                toast("success", "Model Fixed", `Updated to ${item.targetPath}`);
                await refreshMissingStatus();
              }
            }
          });

          bottomRow.appendChild(statusTag);
          bottomRow.appendChild(singleFixBtn);
        } else if (item.status === "wrong_folder" && item.wrongFolder) {
          statusTag.textContent = `In ${item.wrongFolder.kind}/ → Move to ${item.wrongFolder.expected_kind}/`;
          statusTag.style.background = "rgba(251, 191, 36, 0.15)";
          statusTag.style.border = "1px solid rgba(251, 191, 36, 0.35)";
          statusTag.style.color = "#fde68a";

          const moveFixBtn = createButton("Move & Fix", "secondary", "pi pi-folder");
          moveFixBtn.style.padding = "2px 8px";
          moveFixBtn.style.fontSize = "10px";
          moveFixBtn.addEventListener("click", async () => {
            moveFixBtn.disabled = true;
            moveFixBtn.textContent = "Moving...";
            try {
              const moveData = await fetchJSON<{ ok: boolean; target_relpath?: string }>("/mjr_models/move_to_correct_folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_kind: item.wrongFolder.kind,
                  source_relpath: item.wrongFolder.relpath,
                  target_kind: item.wrongFolder.expected_kind,
                }),
              });
              if (moveData?.ok && moveData.target_relpath) {
                applyFixesToGraph([{
                  node_id: item.entry.node_id,
                  widget_name: item.entry.widget_name,
                  new_value: moveData.target_relpath,
                }]);
                toast("success", "Moved & Fixed", `Moved to ${item.wrongFolder.expected_kind}/ and updated.`);
                await refreshMissingStatus();
              } else {
                throw new Error("Move failed");
              }
            } catch (e) {
              toast("error", "Move Failed", String(e));
              moveFixBtn.disabled = false;
            }
          });

          bottomRow.appendChild(statusTag);
          bottomRow.appendChild(moveFixBtn);
        } else {
          statusTag.textContent = "Not on disk";
          statusTag.style.background = "rgba(239, 68, 68, 0.15)";
          statusTag.style.border = "1px solid rgba(239, 68, 68, 0.35)";
          statusTag.style.color = "#fca5a5";

          const dlBtn = createButton("Download", "ghost", "pi pi-download");
          dlBtn.style.padding = "2px 8px";
          dlBtn.style.fontSize = "10px";
          dlBtn.addEventListener("click", () => {
            downloadBtn.click();
          });

          bottomRow.appendChild(statusTag);
          bottomRow.appendChild(dlBtn);
        }

        row.appendChild(topRow);
        row.appendChild(modelNameText);
        row.appendChild(bottomRow);
        itemsList.appendChild(row);
      }

      scanResultsWrap.appendChild(itemsList);
      updateHealth();
    } catch (err) {
      console.error("[mjr] Error in refreshMissingStatus:", err);
    }
  };

  scanBtn.addEventListener("click", async () => {
    await refreshMissingStatus();
    if (fixerState.missing === 0) {
      toast("success", "Model Scan", "All graph models are present.");
    } else if (lastFoundOnDiskCount > 0) {
      toast(
        "warn",
        "Model Scan",
        `${fixerState.missing} missing detected: ${lastFoundOnDiskCount} found on disk and ready to fix!`
      );
    } else {
      toast(
        "warn",
        "Model Scan",
        `${fixerState.missing} missing model(s) detected.`
      );
    }
  });

  fixBtn.addEventListener("click", async () => {
    const missing = scanMissingModelsFromGraph();
    if (!missing || missing.length === 0) {
      toast("info", "Fix Models", "No missing models detected in graph.");
      return;
    }
    const fixes = await showModelFixerDialog({ missing, results: lastScanCandidates });
    if (fixes && fixes.length > 0) {
      const fixedCount = applyFixesToGraph(fixes);
      if (fixedCount > 0) {
        toast("success", "Models Updated", `Updated ${fixedCount} model widget(s).`);
      }
      await refreshMissingStatus();
      updateHealth();
    }
  });

  let isDownloading = false;

  const uniqueMissingForDownload = (missing: Array<{ missing_value?: string; type_hint?: string }>) => {
    const seen = new Set<string>();
    const out: Array<{ missing_value?: string; type_hint?: string }> = [];
    for (const item of missing || []) {
      const key = `${item.missing_value}::${item.type_hint || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  downloadBtn.addEventListener("click", async () => {
    if (isDownloading) {
      toast("warn", "Download in Progress", "Please wait for current downloads to finish.");
      return;
    }

    const originalBtnText = downloadBtn.textContent || "Download Missing";
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Scanning...";

    try {
      const stats = scanMissingModelsWithStats();
      const missing = uniqueMissingForDownload(stats.missing);

      if (!missing.length) {
        toast("info", "No Missing Models", "All model widgets match installed files.");
        return;
      }

      // Fetch workflow notes and stored recipes
      const workflowJson = getSerializedWorkflow();
      const noteRecipes = collectNoteRecipes(workflowJson);
      const payload = missing.map((item) => ({
        missing_value: item.missing_value,
        type_hint: item.type_hint,
      }));

      const resolvedMap = new Map<string, Record<string, unknown>>();
      try {
        const resolved = await resolveModelRecipes(payload);
        for (const entry of (resolved?.resolved || []) as Array<Record<string, unknown>>) {
          const key = normalizeKey(String(entry.key || entry.missing_value || ""));
          resolvedMap.set(key, entry);
        }
      } catch (_) {}

      // Check existing models on disk
      let existingMap: Map<string, Set<string>> | null = null;
      try {
        const modelResp = await getModels();
        const categories = (modelResp?.categories || {}) as Record<string, string[]>;
        existingMap = new Map();
        for (const [kind, items] of Object.entries(categories)) {
          if (!Array.isArray(items)) continue;
          const set = new Set<string>();
          for (const item of items) {
            const raw = String(item || "").replace(/\\/g, "/").toLowerCase();
            if (!raw) continue;
            set.add(raw);
            const base = raw.split("/").pop();
            if (base) set.add(base);
          }
          existingMap.set(kind, set);
        }
      } catch (_) {
        existingMap = null;
      }

      const modelExists = (kind: string, filename: string) => {
        if (!existingMap || !kind || !filename) return false;
        const set = existingMap.get(kind);
        if (!set) return false;
        const normalized = String(filename || "").replace(/\\/g, "/").toLowerCase();
        return set.has(normalized) || set.has(normalized.split("/").pop() || "");
      };

      const allEntries = missing.map((item) => {
        const key = normalizeKey(String(item.missing_value || ""));
        const stored = resolvedMap.get(key) || {};
        const fallbackKind = String(stored.kind || typeHintToKind(String(item.type_hint || "")));
        const noteRecipe = noteRecipes.get(key);
        let recipe = (stored.recipe as Record<string, unknown> | undefined) || null;
        let prefilled = false;
        if (noteRecipe) {
          recipe = noteRecipe;
          if (recipe?.kind === "unknown" && fallbackKind) {
            recipe = { ...recipe, kind: fallbackKind };
          }
          prefilled = true;
        } else if (recipe) {
          recipe = { ...recipe, source: "stored" };
          prefilled = true;
        }

        const kind = String(stored.kind || fallbackKind);
        const filename = String(recipe?.filename || key);
        const exists = modelExists(kind, filename);

        return {
          missing_value: item.missing_value,
          type_hint: item.type_hint,
          key,
          kind,
          recipe,
          prefilled,
          exists,
        };
      });

      const dialogEntries = allEntries.filter((e) => !e.exists);
      const alreadyInstalled = allEntries.length - dialogEntries.length;

      if (dialogEntries.length === 0) {
        if (alreadyInstalled > 0) {
          toast("success", "Models Present", `${alreadyInstalled} model(s) already exist in your models folder.`);
        } else {
          toast("info", "No Models to Download", "All required models are present.");
        }
        return;
      }

      const result = await showModelDownloaderDialog({
        entries: dialogEntries,
        kindOptions: getKindOptions(),
        existingMap,
      });

      if (!result || !result.items || !result.items.length) {
        return;
      }

      // Save recipes if requested
      const saveItems: unknown[] = [];
      if (result.remember && result.saveItems?.length) {
        saveItems.push(...result.saveItems);
      }
      for (const item of result.items) {
        const entry = dialogEntries.find((e) => e.key === item.key);
        if (entry?.recipe && typeof entry.recipe === "object" && (entry.recipe as Record<string, unknown>).source === "workflow_note") {
          saveItems.push(item);
        }
      }
      if (saveItems.length) {
        const seenKeys = new Set<string>();
        const deduped: unknown[] = [];
        for (const item of saveItems) {
          const obj = item as { key?: string };
          if (!obj || !obj.key || seenKeys.has(obj.key)) continue;
          seenKeys.add(obj.key);
          deduped.push(item);
        }
        if (deduped.length) {
          try {
            await saveModelRecipes(deduped);
          } catch (_) {}
        }
      }

      // Launch download job
      isDownloading = true;
      downloadBtn.disabled = true;
      downloadBtn.textContent = "Queueing...";

      const resp = await downloadModels(result.items);
      const jobId = resp?.job_id;
      if (!jobId) {
        throw new Error(String(resp?.error || "Download job not created"));
      }

      downloadBtn.textContent = "Downloading 0%...";
      let finalStatus: Record<string, unknown> | null = null;
      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const status = (await getDownloadStatus(jobId)) as Record<string, unknown>;
          const progress = status?.progress as { pct?: number } | undefined;
          const pct = progress?.pct ?? 0;
          downloadBtn.textContent = `Downloading ${pct}%...`;
          if (status?.state === "done" || status?.state === "error") {
            finalStatus = status;
            break;
          }
        } catch (err) {
          console.warn("[mjr] download status error:", err);
          break;
        }
      }

      const summary = (finalStatus?.summary || {}) as Record<string, unknown>;
      const downloaded = Number(summary.downloaded || 0);
      const errors = Number(summary.errors || 0);
      const skipped = Number(summary.skipped || 0);

      if (finalStatus?.state === "error" || errors > 0) {
        toast("warn", "Download Complete", `Downloaded ${downloaded}, skipped ${skipped}, errors: ${errors}`);
      } else {
        toast("success", "Download Complete", `Downloaded ${downloaded} model(s).`);
      }

      loadModelsList();
      if (typeof (app as any)?.refreshComboInNodes === "function") {
        try {
          (app as any).refreshComboInNodes();
        } catch (_) {}
      }
      if (typeof app?.graph?.setDirtyCanvas === "function") {
        app.graph.setDirtyCanvas(true, true);
      }
      refreshMissingStatus();
      updateHealth();

      if (downloaded > 0) {
        const runFix = await psConfirm({
          title: "Fix Missing Models?",
          message: `Successfully downloaded ${downloaded} model(s).\n\nWould you like to auto-update missing model widgets now?`,
        });
        if (runFix) {
          const remainingMissing = scanMissingModelsFromGraph();
          if (remainingMissing && remainingMissing.length > 0) {
            const fixes = await showModelFixerDialog({ missing: remainingMissing });
            if (fixes && fixes.length > 0) {
              const fixedCount = applyFixesToGraph(fixes);
              if (fixedCount > 0) {
                toast("success", "Models Updated", `Updated ${fixedCount} model widget(s).`);
              }
              refreshMissingStatus();
              updateHealth();
            }
          }
        }
      }
    } catch (err) {
      console.error("[mjr] Download error:", err);
      toast("error", "Download Error", String((err as Error)?.message || err));
    } finally {
      isDownloading = false;
      downloadBtn.disabled = false;
      downloadBtn.textContent = originalBtnText;
    }
  });

  fixerCard.appendChild(fixerHeader);
  fixerCard.appendChild(fixerBtnGrid);
  fixerCard.appendChild(scanResultsWrap);
  fixerCard.appendChild(downloadBtn);

  // -------------------------------------------------------------
  // 3. Community Model Registry Search
  // -------------------------------------------------------------
  const registrySection = createDetails("Community Model Registry", false);

  const searchInput = createInput("Search models on HF, CivitAI...", "");
  const searchBtn = createButton("Search", "secondary", "pi pi-search");
  const contributeBtn = createButton("Contribute Recipe", "ghost", "pi pi-share-alt");

  const searchBar = document.createElement("div");
  searchBar.style.display = "flex";
  searchBar.style.gap = "6px";
  searchBar.appendChild(searchInput);
  searchBar.appendChild(searchBtn);

  const resultsContainer = document.createElement("div");
  resultsContainer.style.display = "flex";
  resultsContainer.style.flexDirection = "column";
  resultsContainer.style.gap = "6px";
  resultsContainer.style.maxHeight = "200px";
  resultsContainer.style.overflowY = "auto";

  const performRegistrySearch = async () => {
    const q = searchInput.value.trim();
    if (!q) return;
    resultsContainer.innerHTML = "";
    searchBtn.disabled = true;
    try {
      const resp = await searchRegistry(q, 6);
      const results = (resp.results || []) as Array<{ name?: string; filename?: string; platform?: string; type?: string }>;
      if (results.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = "No community models matched.";
        empty.style.fontSize = "11px";
        empty.style.color = THEME.textMuted;
        empty.style.textAlign = "center";
        empty.style.padding = "10px";
        resultsContainer.appendChild(empty);
      } else {
        for (const item of results) {
          const itemCard = document.createElement("div");
          itemCard.style.padding = "6px 8px";
          itemCard.style.borderRadius = THEME.radiusSm;
          itemCard.style.background = "rgba(255, 255, 255, 0.03)";
          itemCard.style.border = `1px solid ${THEME.borderColor}`;
          itemCard.style.fontSize = "11px";

          const title = document.createElement("div");
          title.textContent = item.name || item.filename || "Model";
          title.style.fontWeight = "600";
          title.style.color = THEME.primaryColor;

          const meta = document.createElement("div");
          meta.textContent = `${item.platform || "direct"} | ${item.type || "checkpoint"}`;
          meta.style.fontSize = "10px";
          meta.style.color = THEME.textMuted;

          itemCard.appendChild(title);
          itemCard.appendChild(meta);
          resultsContainer.appendChild(itemCard);
        }
      }
    } catch (e: unknown) {
      toast("error", "Search failed", String(e));
    } finally {
      searchBtn.disabled = false;
    }
  };

  searchBtn.addEventListener("click", () => void performRegistrySearch());
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void performRegistrySearch();
  });

  contributeBtn.addEventListener("click", () => {
    showModelContributionDialog();
  });

  registrySection.appendChild(searchBar);
  registrySection.appendChild(resultsContainer);
  registrySection.appendChild(contributeBtn);

  // -------------------------------------------------------------
  // 4. Advanced Fingerprint Cache Section
  // -------------------------------------------------------------
  const fingerprintSection = createDetails("Model Fingerprint Cache", false);

  const fpStatusLabel = document.createElement("div");
  fpStatusLabel.style.fontSize = "11px";
  fpStatusLabel.style.color = THEME.textMuted;
  fpStatusLabel.textContent = "Cache: checking...";

  const buildFpBtn = createButton("Build / Refresh Cache", "secondary", "pi pi-database");

  const refreshFpStatus = () => {
    getFingerprintCacheStatus()
      .then((res) => {
        fpStatusLabel.textContent = `Indexed: ${res.count || 0} models | Last updated: ${res.updated_at || "Never"}`;
      })
      .catch(() => {
        fpStatusLabel.textContent = "Cache: unavailable";
      });
  };
  refreshFpStatus();

  buildFpBtn.addEventListener("click", async () => {
    buildFpBtn.disabled = true;
    fpStatusLabel.textContent = "Building cache (hashing headers)...";
    try {
      const resp = await buildFingerprintCache({ force: true });
      toast("success", "Cache built", `Hashed ${resp.hashed || 0} models (${resp.reused || 0} reused).`);
      refreshFpStatus();
    } catch (e: unknown) {
      toast("error", "Build failed", String(e));
    } finally {
      buildFpBtn.disabled = false;
    }
  });

  fingerprintSection.appendChild(fpStatusLabel);
  fingerprintSection.appendChild(buildFpBtn);

  // Assemble Tab (Workflow Models & Fixer first for high visibility)
  container.appendChild(fixerCard);
  container.appendChild(modelCard);
  container.appendChild(registrySection);
  container.appendChild(fingerprintSection);

  const updateModelSection = () => {
    detectedLabel.textContent = `Detected in workflow: ${state.detectedModelTag || "None"}`;
    useDetectedBtn.style.display = state.detectedModelTag ? "inline-flex" : "none";
    updateTagPreview();
  };

  return {
    element: container,
    refreshMissingStatus,
    updateModelSection,
  };
}
