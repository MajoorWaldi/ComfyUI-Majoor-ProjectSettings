import { fetchJSON } from "./api.js";
import { safeRel, joinRel } from "./utils.js";

export let PATH_WIDGETS = [];
let configPromise = null;

export async function loadConfig() {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      const resp = await fetchJSON("/mjr_project/config");
      const list = Array.isArray(resp?.path_widgets) ? resp.path_widgets : [];
      PATH_WIDGETS = list.map((item) => String(item)).filter(Boolean);
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

export function detectNodeMedia(node) {
  const t = String(node?.comfyClass || node?.type || "").toLowerCase();
  if (t.includes("video") || t.includes("mp4") || t.includes("gif")) return "videos";
  if (t.includes("image") || t.includes("png") || t.includes("jpg") || t.includes("webp"))
    return "images";

  const widgets = node?.widgets || [];
  const hasVideoHints = widgets.some((w) =>
    ["frame_rate", "fps", "duration", "frames_per_second"].includes(String(w?.name || ""))
  );
  return hasVideoHints ? "videos" : "images";
}

export function isSaveLikeNode(node) {
  const t = String(node?.comfyClass || node?.type || "").toLowerCase();
  if (!t.includes("save") && !t.includes("export") && !t.includes("combine")) return false;
  const widgets = node?.widgets || [];
  const hasFilename = widgets.some((w) => w?.name === "filename_prefix");
  const hasPath = widgets.some((w) => w?.name && PATH_WIDGETS.includes(w.name));
  return hasFilename || hasPath;
}

export function alreadyProjectPathed(value) {
  if (!value) return false;
  const s = String(value).replace(/\\/g, "/");
  return s.includes("PROJECTS/") || s.includes("02_OUT/") || s.includes("00_META/");
}

export function patchSingleNode(node, relDir, filenamePrefix) {
  if (!isSaveLikeNode(node)) return false;

  const rel = safeRel(relDir);
  const prefix = safeRel(filenamePrefix);
  const widgets = node?.widgets || [];

  const filenameWidget = widgets.find((w) => w?.name === "filename_prefix");
  const pathWidget = widgets.find((w) => w?.name && PATH_WIDGETS.includes(w.name));

  if (pathWidget && filenameWidget) {
    pathWidget.value = rel;
    filenameWidget.value = prefix;
    return true;
  }
  if (filenameWidget) {
    filenameWidget.value = prefix ? joinRel(rel, prefix) : rel;
    return true;
  }
  if (pathWidget) {
    pathWidget.value = rel;
    return true;
  }
  return false;
}

export async function patchSaveNodes(app, relDir, filenamePrefix, targetMedia) {
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
    app.graph.setDirtyCanvas(true, true);
  } catch (_) {}
  return patched;
}

export function stampGraphProjectSignature(app, state) {
  if (!state?.projectId || !state?.projectFolder) return;
  const g = app?.graph;
  if (!g) return;
  g.extra = g.extra || {};
  g.extra.mjr_project = {
    project_id: state.projectId,
    project_folder: state.projectFolder,
    template: state.pathTemplate || "",
    updated_at: new Date().toISOString(),
  };
}
