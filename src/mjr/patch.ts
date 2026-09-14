import { fetchJSON } from "./api.js";
import { safeRel, joinRel } from "./utils.js";
import type { ComfyGraph, ComfyNode, ComfyWidget, ProjectMedia, RuntimeState } from "../types/domain.js";

export const DEFAULT_PATH_WIDGETS = [
  "output_path",
  "path",
  "save_path",
  "folder",
  "subfolder",
  "output_dir",
  "directory",
  "save_dir",
  "outdir",
  "destination",
];

export let PATH_WIDGETS: string[] = [...DEFAULT_PATH_WIDGETS];
let configPromise: Promise<string[]> | null = null;

export async function loadConfig(): Promise<string[]> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const resp = await fetchJSON<{ path_widgets?: unknown[] }>("/mjr_project/config");
      const list = Array.isArray(resp?.path_widgets) ? resp.path_widgets : [];
      const merged = new Set([...DEFAULT_PATH_WIDGETS, ...list.map((item) => String(item).toLowerCase()).filter(Boolean)]);
      PATH_WIDGETS = Array.from(merged);
      return PATH_WIDGETS;
    } catch (err) {
      console.error("[mjr] Failed to load config:", err);
      return PATH_WIDGETS;
    } finally {
      configPromise = null;
    }
  })();
  return configPromise;
}

export function detectNodeMedia(node: ComfyNode | null | undefined): ProjectMedia {
  const t = String(node?.comfyClass || node?.type || "").toLowerCase();
  if (t.includes("video") || t.includes("mp4") || t.includes("gif") || t.includes("webm") || t.includes("vhs") || t.includes("animate")) return "videos";
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("webp"))
    return "images";

  const widgets = node?.widgets || [];
  const hasVideoHints = widgets.some((w) =>
    ["frame_rate", "fps", "duration", "frames_per_second", "format", "crf", "pingpong"].includes(String(w?.name || "").toLowerCase())
  );
  return hasVideoHints ? "videos" : "images";
}

export function isSaveLikeNode(node: ComfyNode | null | undefined): boolean {
  if (!node) return false;
  const t = String(node?.comfyClass || node?.type || "").toLowerCase();
  if (t.includes("load") || t.includes("sample") || t.includes("encode") || t.includes("decode")) return false;

  const isOutputClass =
    t.includes("save") ||
    t.includes("export") ||
    t.includes("combine") ||
    t.includes("output") ||
    t.includes("write");

  const widgets = node?.widgets || [];
  const hasFilename = widgets.some((w) => {
    const name = String(w?.name || "").toLowerCase();
    return name === "filename_prefix" || name === "filename" || name === "file_prefix" || name === "prefix";
  });
  const hasPath = widgets.some((w) => {
    const name = String(w?.name || "").toLowerCase();
    return PATH_WIDGETS.includes(name);
  });

  return isOutputClass || (hasFilename && hasPath);
}

export function alreadyProjectPathed(value: unknown): boolean {
  if (!value) return false;
  const s = String(value).replace(/\\/g, "/");
  return s.includes("PROJECTS/") || s.includes("02_OUT/") || s.includes("00_META/");
}

export function patchSingleNode(node: ComfyNode | null | undefined, relDir: unknown, filenamePrefix: unknown): boolean {
  if (!isSaveLikeNode(node)) return false;

  const rel = safeRel(relDir);
  const prefix = safeRel(filenamePrefix);
  const widgets = node?.widgets || [];

  const filenameWidget = widgets.find((w) => {
    const name = String(w?.name || "").toLowerCase();
    return name === "filename_prefix" || name === "filename" || name === "file_prefix" || name === "prefix";
  });
  const pathWidget = widgets.find((w) => {
    const name = String(w?.name || "").toLowerCase();
    return PATH_WIDGETS.includes(name);
  });

  let changed = false;
  const updateWidget = (w: ComfyWidget, val: unknown) => {
    if (w.value === val) return;
    w.value = val;
    changed = true;
    if (typeof w.callback === "function") {
      try {
        w.callback(w.value, (node as any)?.graph, node, w);
      } catch (_) {}
    }
    if (typeof (node as any).onWidgetChanged === "function") {
      try {
        (node as any).onWidgetChanged(w.name, w.value, w);
      } catch (_) {}
    }
    if (typeof (node as any).onPropertyChanged === "function") {
      try {
        (node as any).onPropertyChanged(w.name, w.value, w);
      } catch (_) {}
    }
  };

  if (pathWidget && filenameWidget) {
    updateWidget(pathWidget, rel);
    updateWidget(filenameWidget, prefix);
  } else if (filenameWidget) {
    updateWidget(filenameWidget, prefix ? joinRel(rel, prefix) : rel);
  } else if (pathWidget) {
    updateWidget(pathWidget, rel);
  }

  if (changed) {
    if (Array.isArray(node?.widgets)) {
      node!.widgets_values = node!.widgets.map((w) => w?.value);
    }
    if (typeof node?.setDirtyCanvas === "function") {
      node.setDirtyCanvas(true, true);
    }
  }

  return changed;
}

export interface PatchPreviewItem {
  node: ComfyNode;
  nodeLabel: string;
  widget: string;
  oldValue: string;
  newValue: string;
}

export function previewPatchSingleNode(
  node: ComfyNode | null | undefined,
  relDir: unknown,
  filenamePrefix: unknown
): PatchPreviewItem[] {
  if (!isSaveLikeNode(node)) return [];
  if (!node) return [];

  const rel = safeRel(relDir);
  const prefix = safeRel(filenamePrefix);
  const widgets = node?.widgets || [];
  const filenameWidget = widgets.find((w) => w?.name === "filename_prefix");
  const pathWidget = widgets.find((w) => w?.name && PATH_WIDGETS.includes(w.name));
  const nodeLabel = String(node?.title || node?.comfyClass || node?.type || "Save node");
  const items: PatchPreviewItem[] = [];

  if (pathWidget && filenameWidget) {
    items.push({
      node,
      nodeLabel,
      widget: String(pathWidget.name),
      oldValue: String(pathWidget.value ?? ""),
      newValue: rel,
    });
    items.push({
      node,
      nodeLabel,
      widget: String(filenameWidget.name),
      oldValue: String(filenameWidget.value ?? ""),
      newValue: prefix,
    });
    return items;
  }
  if (filenameWidget) {
    items.push({
      node,
      nodeLabel,
      widget: String(filenameWidget.name),
      oldValue: String(filenameWidget.value ?? ""),
      newValue: prefix ? joinRel(rel, prefix) : rel,
    });
    return items;
  }
  if (pathWidget) {
    items.push({
      node,
      nodeLabel,
      widget: String(pathWidget.name),
      oldValue: String(pathWidget.value ?? ""),
      newValue: rel,
    });
  }
  return items;
}

export function previewPatchSaveNodes(
  app: { graph?: ComfyGraph },
  relDir: unknown,
  filenamePrefix: unknown,
  targetMedia?: ProjectMedia
): PatchPreviewItem[] {
  const nodes = app?.graph?._nodes || [];
  const items: PatchPreviewItem[] = [];
  for (const node of nodes) {
    const nm = detectNodeMedia(node);
    if (targetMedia && nm && nm !== targetMedia) continue;
    items.push(...previewPatchSingleNode(node, relDir, filenamePrefix));
  }
  return items;
}

export async function patchSaveNodes(
  app: { graph?: ComfyGraph },
  relDir: unknown,
  filenamePrefix: unknown,
  targetMedia?: ProjectMedia
): Promise<number> {
  await loadConfig();
  const nodes = app?.graph?._nodes || [];
  let patched = 0;
  for (const node of nodes) {
    const nm = detectNodeMedia(node);
    if (targetMedia && nm && nm !== targetMedia) continue;
    if (patchSingleNode(node, relDir, filenamePrefix)) {
      patched += 1;
    }
  }
  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch (_) {}
  return patched;
}

export function stampGraphProjectSignature(app: { graph?: ComfyGraph }, state: RuntimeState | null | undefined): void {
  if (!state?.projectId || !state?.projectFolder) return;
  const g = app?.graph;
  if (!g) return;
  g.extra = g.extra || {};
  g.extra.mjr_project = {
    schema_version: 1,
    project_id: state.projectId,
    project_folder: state.projectFolder,
    template: state.pathTemplate || "",
    name: state.name || "",
    kind: state.kind || "asset",
    media: state.media || "images",
    rel_dir: state.lastRelDir || "",
    prefix: state.lastPrefix || "",
    updated_at: new Date().toISOString(),
  };
}
