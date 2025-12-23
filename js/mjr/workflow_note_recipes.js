const NOTE_TYPE_RE = /markdown|note/i;
const NOTE_TITLE_RE = /note/i;
const ALLOWED_EXTENSIONS = [".safetensors", ".ckpt", ".pt", ".pth", ".bin"];
const SECTION_KINDS = new Set([
  "text_encoders",
  "clip_vision",
  "loras",
  "diffusion_models",
  "vae",
]);

function normalizeSectionLine(line) {
  let t = String(line || "").trim().toLowerCase();
  if (!t) return "";
  t = t.replace(/^#+\s*/, "");
  t = t.replace(/:\s*$/, "");
  return t.trim();
}

function normalizeUrl(url) {
  let u = String(url || "").trim();
  if (!u) return "";
  u = u.replace(/\/blob\//i, "/resolve/");
  return u;
}

function basenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || "";
    const parts = path.split("/").filter(Boolean);
    const base = parts.length ? parts[parts.length - 1] : "";
    return base;
  } catch (_) {
    const clean = String(url || "").split("?")[0].split("#")[0];
    const parts = clean.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }
}

function hasAllowedExtension(filename) {
  const lower = String(filename || "").toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function inferKindFromUrl(url) {
  const lower = String(url || "").toLowerCase();

  // Check URL path for kind indicators
  if (lower.includes("/text_encoders/") || lower.includes("text_encoder")) return "text_encoders";
  if (lower.includes("/diffusion_models/") || lower.includes("diffusion_model")) return "diffusion_models";
  if (lower.includes("/clip_vision/")) return "clip_vision";
  if (lower.includes("/loras/") || lower.includes("/lora/")) return "loras";
  if (lower.includes("/vae/")) return "vae";
  if (lower.includes("/controlnet/")) return "controlnet";
  if (lower.includes("/upscale_models/") || lower.includes("/upscale/")) return "upscale_models";
  if (lower.includes("/clip/")) return "clip";
  if (lower.includes("/unet/")) return "unet";
  if (lower.includes("/embeddings/") || lower.includes("/embedding/")) return "embeddings";
  if (lower.includes("/checkpoints/") || lower.includes("/checkpoint/")) return "checkpoints";

  return "unknown";
}

function getNoteTextFromNode(node) {
  const props = node?.properties || {};
  const candidates = [
    props?.text,
    props?.value,
    props?.markdown,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 20) {
      return candidate;
    }
  }

  const widgetsValues = node?.widgets_values;
  if (Array.isArray(widgetsValues)) {
    const parts = widgetsValues.filter((v) => typeof v === "string" && v.trim().length > 0);
    const joined = parts.join("\n");
    if (joined.trim().length > 20) return joined;
  }

  const widgets = node?.widgets;
  if (Array.isArray(widgets)) {
    const parts = widgets
      .map((w) => w?.value)
      .filter((v) => typeof v === "string" && v.trim().length > 0);
    const joined = parts.join("\n");
    if (joined.trim().length > 20) return joined;
  }
  return "";
}

function isNoteLikeNode(node) {
  const type = String(node?.type || node?.class_type || "").trim();
  const title = String(node?.title || "").trim();
  return NOTE_TYPE_RE.test(type) || NOTE_TITLE_RE.test(title);
}

function collectGraphsFromNode(node) {
  return [
    node?.subgraph,
    node?._subgraph,
    node?.subgraph?.graph,
    node?.subgraph?.lgraph,
    node?.properties?.subgraph,
    node?.subgraph_instance,
    node?.subgraph_instance?.graph,
  ].filter(Boolean);
}

function walkGraph(graph, visitor, visited) {
  if (!graph || !Array.isArray(graph.nodes)) return;
  if (visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph.nodes) {
    visitor(node);
    const children = collectGraphsFromNode(node);
    for (const child of children) {
      if (Array.isArray(child?.nodes)) {
        walkGraph(child, visitor, visited);
      }
    }
  }
}

export function extractNoteTexts(workflowJson) {
  if (!workflowJson || !Array.isArray(workflowJson.nodes)) return [];
  const texts = new Set();
  const visited = new WeakSet();
  const graph = { nodes: workflowJson.nodes };

  walkGraph(
    graph,
    (node) => {
      if (!isNoteLikeNode(node)) return;
      const text = getNoteTextFromNode(node);
      if (text && text.trim().length > 20) {
        texts.add(text.trim());
      }
    },
    visited
  );

  return Array.from(texts);
}

export function parseRecipesFromNoteText(text) {
  const recipes = new Map();
  const lines = String(text || "").split(/\r?\n/);
  let currentKind = "unknown";

  for (const line of lines) {
    const normalized = normalizeSectionLine(line);
    if (SECTION_KINDS.has(normalized)) {
      currentKind = normalized;
      continue;
    }

    const urls = new Set();
    const mdRegex = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g;
    let match = null;
    while ((match = mdRegex.exec(line)) !== null) {
      if (match[1]) urls.add(match[1]);
    }
    const rawRegex = /(https?:\/\/[^\s]+)/g;
    while ((match = rawRegex.exec(line)) !== null) {
      if (match[1]) urls.add(match[1]);
    }

    for (const url of urls) {
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) continue;
      const filename = basenameFromUrl(normalizedUrl);
      if (!filename || !hasAllowedExtension(filename)) continue;
      if (recipes.has(filename)) {
        console.debug("[mjr] workflow note recipe duplicate", filename);
        continue;
      }

      // Use section kind if available, otherwise infer from URL
      let finalKind = currentKind;
      if (!finalKind || finalKind === "unknown") {
        finalKind = inferKindFromUrl(normalizedUrl);
      }

      recipes.set(filename, {
        key: filename,
        kind: finalKind,
        url: normalizedUrl,
        filename,
        source: "workflow_note",
      });
    }
  }
  return recipes;
}

export function collectRecipesFromWorkflowNotes(workflowJson) {
  const texts = extractNoteTexts(workflowJson);
  const merged = new Map();
  for (const text of texts) {
    const parsed = parseRecipesFromNoteText(text);
    for (const [key, recipe] of parsed.entries()) {
      if (!merged.has(key)) {
        merged.set(key, recipe);
      }
    }
  }
  return merged;
}
