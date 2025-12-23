import { app } from "../../../scripts/app.js";
import { getSerializedWorkflow } from "./graph.js";

const MAX_MISSING = 200;

// Widgets to exclude from model detection (images, etc.)
const IMAGE_WIDGET_NAMES = new Set([
  "image",
  "images",
  "input_image",
  "image_path",
  "mask",
  "background",
  "foreground",
]);

function isImageWidget(widgetName) {
  const lower = String(widgetName || "").toLowerCase();
  if (IMAGE_WIDGET_NAMES.has(lower)) return true;
  if (lower.includes("png") || lower.includes("jpg") || lower.includes("jpeg")) return true;
  return false;
}

function typeHintFromNode(node, widgetName) {
  const nodeType = String(node?.type || node?.title || "").toLowerCase();
  const widgetLower = String(widgetName || "").toLowerCase();
  const nodeHasClipVision =
    nodeType.includes("clip_vision") ||
    nodeType.includes("clip vision") ||
    (nodeType.includes("clip") && nodeType.includes("vision"));

  // Match based on node type (highest priority)
  if (nodeHasClipVision) return "clip_vision";
  if (nodeType.includes("checkpoint")) {
    if (widgetLower.includes("vae")) return "vae";
    if (widgetLower.includes("lora")) return "lora";
    return "checkpoint";
  }
  if (nodeType.includes("loader")) {
    if (widgetLower.includes("vae")) return "vae";
    if (widgetLower.includes("lora")) return "lora";
    if (widgetLower.includes("unet") || widgetLower.includes("diffusion")) return "unet";
    if (widgetLower.includes("text_encoder") || widgetLower.includes("text encoder"))
      return "text_encoders";
    if (widgetLower.includes("clip")) return "clip";
  }
  if (nodeType.includes("lora")) return "lora";
  if (nodeType.includes("vae")) return "vae";
  if (nodeType.includes("controlnet") || nodeType.includes("control")) return "controlnet";
  if (nodeType.includes("upscale")) return "upscale_models";
  if (nodeType.includes("clip")) {
    if (widgetLower.includes("vision")) return "clip_vision";
    return "clip";
  }
  if (nodeType.includes("text_encoder") || nodeType.includes("text encoder"))
    return "text_encoders";
  if (nodeType.includes("unet")) return "unet";
  if (nodeType.includes("embedding") || nodeType.includes("textual")) return "embeddings";

  // Match based on widget name (secondary priority)
  if (widgetLower.includes("ckpt") || widgetLower.includes("checkpoint")) return "checkpoint";
  if (widgetLower.includes("lora")) return "lora";
  if (widgetLower.includes("vae")) return "vae";
  if (widgetLower.includes("controlnet") || widgetLower.includes("control")) return "controlnet";
  if (widgetLower.includes("upscale")) return "upscale_models";
  if (widgetLower.includes("clip")) {
    if (widgetLower.includes("vision")) return "clip_vision";
    return "clip";
  }
  if (widgetLower.includes("text_encoder") || widgetLower.includes("text encoder"))
    return "text_encoders";
  if (widgetLower.includes("diffusion")) return "diffusion_models";
  if (widgetLower.includes("unet")) return "unet";
  if (widgetLower.includes("embedding")) return "embeddings";

  return "unknown";
}

// Recursively collect all nodes including those in subgraphs and groups
function collectAllNodes(graph) {
  const allNodes = [];
  const visited = new Set();

  function collectFromGraph(g) {
    if (!g || !Array.isArray(g._nodes)) return;

    for (const node of g._nodes) {
      if (!node || visited.has(node.id)) continue;
      visited.add(node.id);
      allNodes.push(node);

      // Check for subgraph
      if (node.subgraph && typeof node.subgraph === "object") {
        collectFromGraph(node.subgraph);
      }

      // Check for group nodes (some implementations)
      if (node.graph && typeof node.graph === "object" && node.graph !== g) {
        collectFromGraph(node.graph);
      }
    }
  }

  collectFromGraph(graph);
  return allNodes;
}

export function scanMissingModelsFromGraph() {
  return scanMissingModelsWithStats().missing;
}

export function scanMissingModelsWithStats() {
  const graph = app?.graph;
  if (!graph) return { missing: [], total: 0 };
  // Attempt serialization for consistency, but don't block scan if it fails.
  getSerializedWorkflow();

  // Collect all nodes including subgraphs and groups
  const allNodes = collectAllNodes(graph);

  const missing = [];
  const nodesWithMissing = new Set();
  let total = 0;

  for (const node of allNodes) {
    const widgets = node?.widgets || [];
    for (const widget of widgets) {
      const widgetName = widget?.name || "";

      // Skip image widgets
      if (isImageWidget(widgetName)) continue;

      const values = widget?.options?.values;
      if (!Array.isArray(values)) continue;
      const value = widget?.value;
      if (!value) continue;
      total += 1;
      if (values.includes(value)) continue;

      missing.push({
        node_id: node?.id ?? null,
        node_title: node?.title || node?.type || "",
        widget_name: widgetName,
        missing_value: String(value),
        type_hint: typeHintFromNode(node, widgetName),
      });

      // Track nodes with missing models
      if (node?.id != null) {
        nodesWithMissing.add(node.id);
      }

      if (missing.length >= MAX_MISSING) break;
    }
    if (missing.length >= MAX_MISSING) break;
  }

  // Highlight nodes with missing models
  highlightNodesWithMissingModels(allNodes, nodesWithMissing);

  return { missing, total };
}

function highlightNodesWithMissingModels(allNodes, nodesWithMissing) {
  for (const node of allNodes) {
    if (!node) continue;

    if (nodesWithMissing.has(node.id)) {
      if (!node.__mjrMissingHighlight) {
        node.__mjrMissingHighlight = true;
        node.__mjrMissingColor = node.color ?? null;
        node.__mjrMissingBgcolor = node.bgcolor ?? null;
      }
      // Highlight node with missing models (border only)
      node.color = "#FF0000";
      node.bgcolor = null;
    } else if (node.__mjrMissingHighlight) {
      // Restore original colors if no longer missing
      node.color = node.__mjrMissingColor ?? null;
      node.bgcolor = node.__mjrMissingBgcolor ?? null;
      delete node.__mjrMissingHighlight;
      delete node.__mjrMissingColor;
      delete node.__mjrMissingBgcolor;
    }
  }

  // Force canvas redraw
  if (typeof app?.graph?.setDirtyCanvas === "function") {
    app.graph.setDirtyCanvas(true, true);
  }
}

export function applyFixesToGraph(fixes) {
  const graph = app?.graph;
  if (!graph) return 0;

  // Collect all nodes including subgraphs and groups
  const allNodes = collectAllNodes(graph);

  const nodesById = new Map();
  for (const node of allNodes) {
    if (node && node.id != null) {
      nodesById.set(node.id, node);
    }
  }

  let fixed = 0;
  const fixedNodeIds = new Set();

  for (const fix of fixes || []) {
    if (!fix) continue;
    const node = nodesById.get(fix.node_id);
    if (!node) continue;
    const widgets = node?.widgets || [];
    const widget = widgets.find((w) => w?.name === fix.widget_name);
    if (!widget) continue;
    widget.value = fix.new_value;
    // Ensure widget callbacks fire so nodes update internal state.
    if (typeof widget.callback === "function") {
      try {
        widget.callback(widget.value, app.graph, node, widget);
      } catch (_) {}
    }
    if (typeof node.onWidgetChanged === "function") {
      try {
        node.onWidgetChanged(widget.name, widget.value, widget);
      } catch (_) {}
    }
    if (typeof node.onPropertyChanged === "function") {
      try {
        node.onPropertyChanged(widget.name, widget.value, widget);
      } catch (_) {}
    }
    if (Array.isArray(node.widgets)) {
      node.widgets_values = node.widgets.map((w) => w?.value);
    }
    if (typeof node.setDirtyCanvas === "function") {
      node.setDirtyCanvas(true, true);
    }
    fixed += 1;
    fixedNodeIds.add(fix.node_id);
  }

  // Clear highlighting on fixed nodes
  for (const nodeId of fixedNodeIds) {
    const node = nodesById.get(nodeId);
    if (node && node.color === "#FF0000") {
      node.color = null;
      node.bgcolor = null;
    }
  }

  if (fixed > 0 && typeof graph.setDirtyCanvas === "function") {
    graph.setDirtyCanvas(true, true);
  }
  if (fixed > 0 && typeof app?.refreshComboInNodes === "function") {
    try {
      app.refreshComboInNodes();
    } catch (_) {}
  }
  return fixed;
}
