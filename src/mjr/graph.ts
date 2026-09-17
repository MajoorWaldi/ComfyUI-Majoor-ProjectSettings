import { app } from "../../../scripts/app.js";
import type {
  ComfyGraph,
  ComfyNode,
  GraphOutputMetadata,
  GraphProjectSignature,
  ProjectMedia,
  SerializedWorkflow,
} from "../types/domain.js";
import { detectNodeMedia, PATH_WIDGETS } from "./patch.js";
import { asGraph, getInnerGraphFromNode, collectAllNodes } from "./graph_utils.js";
export { collectAllNodes };

const DEBUG = false;

export interface DetectedModelInfo {
  raw: string;
  tag: string;
  kind: "checkpoint" | "diffusion" | "unet" | "other";
  nodeType?: string;
  nodeTitle?: string;
}

const IGNORE_NODE_SUBSTRINGS = [
  "lora",
  "controlnet",
  "control_net",
  "upscale",
  "face",
  "segment",
  "sam",
  "vae",
  "clip",
  "t5",
  "ipadapter",
  "animatestick",
  "depth",
  "canny",
  "openpose",
  "inpaint",
  "outpaint",
  "rembg",
  "segmentation",
  "annotator",
  "preprocess",
  "latent",
  "sampler",
  "save",
  "preview",
  "loadimage",
];

const IGNORE_WIDGET_SUBSTRINGS = [
  "lora",
  "vae",
  "clip",
  "controlnet",
  "control_net",
  "upscale",
  "image",
  "mask",
  "audio",
  "video",
  "scheduler",
  "sampler",
  "prompt",
];

function isLikelyModelFile(val: unknown): boolean {
  if (typeof val !== "string" || !val.trim()) return false;
  const s = val.trim().toLowerCase();
  if (s === "none" || s === "undefined" || s === "null" || s === "auto" || s === "default") return false;
  const modelExts = [".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".sft"];
  if (modelExts.some((ext) => s.endsWith(ext))) return true;
  return s.length >= 3 && !/\s/.test(s) && !s.startsWith("http");
}

function scanGraphForModelInfo(
  graph: ComfyGraph | null | undefined,
  token3TagFn: (raw: unknown, upper?: boolean) => string,
  visited: WeakSet<object>
): DetectedModelInfo | null {
  if (!graph || !Array.isArray(graph._nodes)) return null;
  if (visited.has(graph)) return null;
  visited.add(graph);

  const candidates: Array<DetectedModelInfo & { priority: number }> = [];

  for (const node of graph._nodes) {
    const nodeType = String(node?.type || node?.comfyClass || "").toLowerCase();
    const nodeTitle = String(node?.title || "");

    if (IGNORE_NODE_SUBSTRINGS.some((sub) => nodeType.includes(sub))) {
      continue;
    }

    const widgets = node?.widgets || [];
    for (const w of widgets) {
      const widgetName = String(w?.name || "").toLowerCase();
      if (!widgetName) continue;
      if (IGNORE_WIDGET_SUBSTRINGS.some((sub) => widgetName.includes(sub))) continue;

      const val = w?.value;
      if (!isLikelyModelFile(val)) continue;
      const raw = String(val).trim();
      const tag = token3TagFn ? token3TagFn(raw, false) : raw;
      if (!tag) continue;

      // Priority 1: Checkpoints
      if (
        nodeType.includes("checkpoint") ||
        widgetName === "ckpt_name" ||
        widgetName === "checkpoint_name" ||
        widgetName === "checkpoint"
      ) {
        candidates.push({
          raw,
          tag,
          kind: "checkpoint",
          nodeType: node?.type || node?.comfyClass,
          nodeTitle,
          priority: 1,
        });
        continue;
      }

      // Priority 2: Diffusion / UNet loaders
      if (
        nodeType.includes("diffusion") ||
        nodeType.includes("unet") ||
        nodeType.includes("wan") ||
        nodeType.includes("hunyuan") ||
        nodeType.includes("cogvideo") ||
        widgetName === "unet_name" ||
        widgetName === "diffusion_model" ||
        widgetName === "model_name"
      ) {
        candidates.push({
          raw,
          tag,
          kind: "diffusion",
          nodeType: node?.type || node?.comfyClass,
          nodeTitle,
          priority: 2,
        });
        continue;
      }

      // Priority 3: Other model widgets
      if (widgetName.includes("model") || widgetName.includes("gguf")) {
        candidates.push({
          raw,
          tag,
          kind: "other",
          nodeType: node?.type || node?.comfyClass,
          nodeTitle,
          priority: 3,
        });
      }
    }

    const inner = getInnerGraphFromNode(node);
    if (inner) {
      const subInfo = scanGraphForModelInfo(inner, token3TagFn, visited);
      if (subInfo) {
        candidates.push({ ...subInfo, priority: 2 });
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0];
}

function scanGraphForProjectFolder(
  graph: ComfyGraph | null | undefined,
  isSaveLikeNodeFn: (node: ComfyNode) => boolean,
  visited: WeakSet<object>
): string {
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

export function readGraphSignature(): GraphProjectSignature | null {
  const g = app?.graph as ComfyGraph | undefined;
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

export function inferProjectFolderFromGraph(isSaveLikeNodeFn: (node: ComfyNode) => boolean): string {
  const g = app?.graph as ComfyGraph | undefined;
  return scanGraphForProjectFolder(g, isSaveLikeNodeFn, new WeakSet());
}

export function detectModelInfoFromGraph(token3TagFn: (raw: unknown, upper?: boolean) => string): DetectedModelInfo | null {
  const g = app?.graph as ComfyGraph | undefined;
  return scanGraphForModelInfo(g, token3TagFn, new WeakSet());
}

export function detectModelFromGraph(token3TagFn: (raw: unknown, upper?: boolean) => string): string {
  const info = detectModelInfoFromGraph(token3TagFn);
  return info?.tag || "";
}

export function getSerializedWorkflow(): SerializedWorkflow | null {
  const g = app?.graph as ComfyGraph | undefined;
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

export function extractGraphOutputMetadata(
  isSaveLikeNodeFn: (node: ComfyNode) => boolean
): GraphOutputMetadata | null {
  const g = app?.graph as ComfyGraph | undefined;
  if (!g) return null;

  const result: GraphOutputMetadata = {};

  // 1. Check signature first
  const sig = readGraphSignature();
  if (sig) {
    if (sig.name && typeof sig.name === "string") result.name = sig.name;
    if (sig.kind && typeof sig.kind === "string") result.kind = sig.kind;
    if (sig.media && typeof sig.media === "string") result.media = sig.media as ProjectMedia;
    if (sig.rel_dir && typeof sig.rel_dir === "string") result.relDir = sig.rel_dir;
    if (sig.prefix && typeof sig.prefix === "string") result.prefix = sig.prefix;
    if (sig.project_folder && typeof sig.project_folder === "string") result.projectFolder = sig.project_folder;
  }

  // 2. Scan save nodes in graph to find or supplement output info
  const allNodes = collectAllNodes(g);
  for (const node of allNodes) {
    if (isSaveLikeNodeFn && !isSaveLikeNodeFn(node)) continue;

    if (!result.media) {
      const detectedMedia = detectNodeMedia(node);
      if (detectedMedia) result.media = detectedMedia;
    }

    const widgets = node?.widgets || [];
    for (const w of widgets) {
      const val = w?.value;
      if (typeof val !== "string" && typeof val !== "number") continue;
      const s = String(val).replace(/\\/g, "/");

      if (s.includes("PROJECTS/")) {
        const after = s.substring(s.indexOf("PROJECTS/") + "PROJECTS/".length);
        const segments = after.split("/").filter(Boolean);
        if (segments.length > 0 && !result.projectFolder) {
          result.projectFolder = segments[0];
        }
        for (let i = 1; i < segments.length; i++) {
          const seg = segments[i].trim();
          if (!seg) continue;
          if (!result.media && /^(images|videos|img|vid)$/i.test(seg)) {
            result.media = (seg.toLowerCase().startsWith("vid") ? "videos" : "images") as ProjectMedia;
          } else if (
            !result.name &&
            seg !== "02_OUT" &&
            seg !== "00_META" &&
            seg !== "01_WORK" &&
            !/^\d{6,8}$/.test(seg)
          ) {
            result.name = seg;
          }
        }

        const wName = String(w?.name || "").toLowerCase();
        if (PATH_WIDGETS.includes(wName)) {
          if (!result.relDir) result.relDir = s;
        } else if (wName === "filename_prefix" || wName === "prefix" || wName === "file_prefix") {
          const lastSlash = s.lastIndexOf("/");
          if (lastSlash > 0) {
            const dirPart = s.substring(0, lastSlash);
            const filePart = s.substring(lastSlash + 1);
            if (!result.relDir) result.relDir = dirPart;
            if (!result.prefix && filePart) result.prefix = filePart;
          } else {
            if (!result.prefix) result.prefix = s;
          }
        }
      } else {
        const wName = String(w?.name || "").toLowerCase();
        if ((wName === "filename_prefix" || wName === "prefix" || wName === "file_prefix") && !result.prefix) {
          const prefixStr = String(val).trim();
          if (prefixStr) {
            result.prefix = prefixStr;
            if (!result.name) {
              const pm = prefixStr.match(/(?:^\d{6}_)?([a-zA-Z0-9_-]+?)(?:_\d+|_)?$/);
              if (pm && pm[1]) {
                result.name = pm[1];
              }
            }
          }
        }
      }
    }
  }

  if (!result.kind) {
    if (result.name && /^(sq|sh|shot|seq)[0-9_]/i.test(result.name)) {
      result.kind = "shot";
    } else if (result.name) {
      result.kind = "asset";
    }
  }

  if (result.relDir && result.prefix && result.relDir.endsWith("/" + result.prefix)) {
    result.relDir = result.relDir.slice(0, -(result.prefix.length + 1));
  } else if (result.relDir && result.prefix && result.relDir.endsWith(result.prefix)) {
    result.relDir = result.relDir.slice(0, -result.prefix.length).replace(/\/+$/, "");
  }

  const hasAny = !!(result.name || result.kind || result.media || result.relDir || result.prefix || result.projectFolder);
  return hasAny ? result : null;
}
