import { app } from "../../../scripts/app.js";

const DEBUG = false;

function getInnerGraphFromNode(node) {
  if (!node) return null;
  const candidates = [
    node.subgraph,
    node._subgraph,
    node?.subgraph?.graph,
    node?.subgraph?.lgraph,
    node?.properties?.subgraph,
    node.subgraph_instance,
    node?.subgraph_instance?.graph,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate?._nodes)) return candidate;
    if (Array.isArray(candidate?.graph?._nodes)) return candidate.graph;
  }
  return null;
}

function scanGraphForModel(graph, token3TagFn, visited) {
  if (!graph || !Array.isArray(graph._nodes)) return "";
  if (visited.has(graph)) return "";
  visited.add(graph);

  const keys = [
    "ckpt",
    "checkpoint",
    "checkpoint_name",
    "ckpt_name",
    "model",
    "model_name",
    "diffusion",
    "diffusion_model",
    "unet",
    "unet_name",
    "gguf",
  ];

  for (const node of graph._nodes) {
    const widgets = node?.widgets || [];
    for (const w of widgets) {
      const name = String(w?.name || "").toLowerCase();
      if (!name) continue;
      if (!keys.some((k) => name.includes(k))) continue;
      const val = w?.value;
      if (typeof val !== "string") continue;
      const tag = token3TagFn ? token3TagFn(val, false) : "";
      if (tag) {
        if (DEBUG) console.debug("[mjr] model tag found", tag);
        return tag;
      }
    }
    const inner = getInnerGraphFromNode(node);
    if (inner) {
      if (DEBUG) console.debug("[mjr] scanning subgraph for model");
      const subTag = scanGraphForModel(inner, token3TagFn, visited);
      if (subTag) return subTag;
    }
  }
  return "";
}

function scanGraphForProjectFolder(graph, isSaveLikeNodeFn, visited) {
  if (!graph || !Array.isArray(graph._nodes)) return "";
  if (visited.has(graph)) return "";
  visited.add(graph);

  for (const node of graph._nodes) {
    if (isSaveLikeNodeFn && !isSaveLikeNodeFn(node)) continue;
    const widgets = node?.widgets || [];
    for (const w of widgets) {
      const v = w?.value;
      if (typeof v === "string" || typeof v === "number") {
        const s = String(v).replace(/\\/g, "/");
        const m = s.match(/PROJECTS\/([^/]+)/i);
        if (m && m[1]) return m[1];
      }
    }
    const inner = getInnerGraphFromNode(node);
    if (inner) {
      if (DEBUG) console.debug("[mjr] scanning subgraph for project folder");
      const subFolder = scanGraphForProjectFolder(inner, isSaveLikeNodeFn, visited);
      if (subFolder) return subFolder;
    }
  }
  return "";
}

export function readGraphSignature() {
  const g = app?.graph;
  if (!g) return null;
  const direct = g?.extra?.mjr_project;
  if (direct && typeof direct === "object") return direct;
  try {
    const ser = g?.serialize?.();
    const sig = ser?.extra?.mjr_project;
    if (sig && typeof sig === "object") return sig;
  } catch (_) {}
  return null;
}

export function inferProjectFolderFromGraph(isSaveLikeNodeFn) {
  const g = app?.graph;
  return scanGraphForProjectFolder(g, isSaveLikeNodeFn, new WeakSet());
}

export function detectModelFromGraph(token3TagFn) {
  const g = app?.graph;
  return scanGraphForModel(g, token3TagFn, new WeakSet());
}

export function getSerializedWorkflow() {
  const g = app?.graph;
  if (!g || typeof g.serialize !== "function") return null;
  try {
    const ser = g.serialize();
    if (g.extra && typeof g.extra === "object") {
      ser.extra = ser.extra || {};
      Object.assign(ser.extra, g.extra);
    }
    return ser;
  } catch (_) {
    return null;
  }
}
