import { app } from "../../../scripts/app.js";
const MAX_MISSING = 200;
const VALUE_SET_THRESHOLD = 256;
export const MODEL_FILE_EXTENSIONS = new Set([
    ".safetensors",
    ".ckpt",
    ".pt",
    ".pth",
    ".bin",
    ".sft",
    ".onnx",
    ".gguf",
]);
export function isModelFileName(name) {
    const lower = String(name || "").toLowerCase().trim();
    return Array.from(MODEL_FILE_EXTENSIONS).some((ext) => lower.endsWith(ext));
}
export function normalizePath(path) {
    return String(path || "").replace(/\\/g, "/").trim();
}
// Widgets to exclude from model detection (images, masks, outputs, etc.)
const IMAGE_WIDGET_NAMES = new Set([
    "image",
    "images",
    "input_image",
    "image_path",
    "mask",
    "mask_path",
    "background",
    "foreground",
]);
const FILE_MEDIA_EXTENSIONS = [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".avi",
    ".mp3",
    ".wav",
    ".flac",
    ".ogg",
];
function isImageWidget(widgetName) {
    const lower = String(widgetName || "").toLowerCase();
    if (IMAGE_WIDGET_NAMES.has(lower))
        return true;
    if (lower.includes("png") || lower.includes("jpg") || lower.includes("jpeg"))
        return true;
    return false;
}
function looksLikeNonModelFile(widgetName, value) {
    const v = String(value || "").toLowerCase().trim();
    if (FILE_MEDIA_EXTENSIONS.some((ext) => v.endsWith(ext)))
        return true;
    return false;
}
export function typeHintFromNode(node, widgetName) {
    const nodeType = String(node?.type || node?.title || "").toLowerCase();
    const widgetLower = String(widgetName || "").toLowerCase();
    const nodeHasClipVision = nodeType.includes("clip_vision") ||
        nodeType.includes("clip vision") ||
        (nodeType.includes("clip") && nodeType.includes("vision"));
    // Match based on node type (highest priority)
    if (nodeHasClipVision)
        return "clip_vision";
    if (nodeType.includes("checkpoint") || nodeType.includes("ckpt")) {
        if (widgetLower.includes("vae"))
            return "vae";
        if (widgetLower.includes("lora"))
            return "lora";
        return "checkpoint";
    }
    if (nodeType.includes("loader")) {
        if (widgetLower.includes("vae"))
            return "vae";
        if (widgetLower.includes("lora"))
            return "lora";
        if (widgetLower.includes("unet") || widgetLower.includes("diffusion"))
            return "unet";
        if (widgetLower.includes("text_encoder") || widgetLower.includes("text encoder") || widgetLower.includes("t5"))
            return "text_encoders";
        if (widgetLower.includes("clip"))
            return "clip";
    }
    if (nodeType.includes("lora"))
        return "lora";
    if (nodeType.includes("vae"))
        return "vae";
    if (nodeType.includes("controlnet") || nodeType.includes("control"))
        return "controlnet";
    if (nodeType.includes("upscale"))
        return "upscale_models";
    if (nodeType.includes("clip")) {
        if (widgetLower.includes("vision"))
            return "clip_vision";
        return "clip";
    }
    if (nodeType.includes("text_encoder") || nodeType.includes("text encoder") || nodeType.includes("t5"))
        return "text_encoders";
    if (nodeType.includes("unet"))
        return "unet";
    if (nodeType.includes("diffusion") ||
        nodeType.includes("wan") ||
        nodeType.includes("minimax") ||
        nodeType.includes("ltx") ||
        nodeType.includes("mochi") ||
        nodeType.includes("cog") ||
        nodeType.includes("hunyuan") ||
        nodeType.includes("flux")) {
        if (widgetLower.includes("vae"))
            return "vae";
        if (widgetLower.includes("lora"))
            return "lora";
        if (widgetLower.includes("text_encoder") || widgetLower.includes("clip"))
            return "text_encoders";
        return "diffusion_models";
    }
    if (nodeType.includes("embedding") || nodeType.includes("textual"))
        return "embeddings";
    // Match based on widget name (secondary priority)
    if (widgetLower.includes("ckpt") || widgetLower.includes("checkpoint"))
        return "checkpoint";
    if (widgetLower.includes("lora"))
        return "lora";
    if (widgetLower.includes("vae"))
        return "vae";
    if (widgetLower.includes("controlnet") || widgetLower.includes("control"))
        return "controlnet";
    if (widgetLower.includes("upscale"))
        return "upscale_models";
    if (widgetLower.includes("clip")) {
        if (widgetLower.includes("vision"))
            return "clip_vision";
        return "clip";
    }
    if (widgetLower.includes("text_encoder") || widgetLower.includes("text encoder") || widgetLower.includes("t5"))
        return "text_encoders";
    if (widgetLower.includes("diffusion"))
        return "diffusion_models";
    if (widgetLower.includes("unet"))
        return "unet";
    if (widgetLower.includes("embedding"))
        return "embeddings";
    if (widgetLower.includes("model"))
        return "checkpoint";
    return "unknown";
}
function isModelWidget(node, widgetName, value) {
    if (isImageWidget(widgetName))
        return false;
    if (looksLikeNonModelFile(widgetName, value))
        return false;
    const valueStr = String(value || "").trim();
    if (isModelFileName(valueStr))
        return true;
    return typeHintFromNode(node, widgetName) !== "unknown";
}
// Recursively collect all nodes including those in subgraphs and groups
export function collectAllNodes(graph) {
    const allNodes = [];
    const visited = new WeakSet();
    function collectFromGraph(g) {
        const cg = g;
        if (!cg || !Array.isArray(cg._nodes))
            return;
        for (const node of cg._nodes) {
            if (!node || typeof node !== "object")
                continue;
            if (visited.has(node))
                continue;
            visited.add(node);
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
export function resolveComboValues(widget) {
    const rawValues = widget?.options?.values;
    if (!rawValues)
        return [];
    if (typeof rawValues === "function") {
        try {
            const res = rawValues(widget);
            return Array.isArray(res) ? res.map(String) : [];
        }
        catch (_) {
            return [];
        }
    }
    if (Array.isArray(rawValues))
        return rawValues.map(String);
    if (typeof rawValues === "object" && rawValues !== null)
        return Object.keys(rawValues).map(String);
    return [];
}
export function findMatchInOptions(options, value) {
    if (!options || options.length === 0) {
        return { isExact: false, matchValue: null, foundInSubfolder: false };
    }
    const valNorm = normalizePath(value);
    const valBase = valNorm.split("/").pop() || "";
    const valLower = valNorm.toLowerCase();
    const valBaseLower = valBase.toLowerCase();
    // 1. Direct exact or normalized path match
    for (const opt of options) {
        const optNorm = normalizePath(opt);
        if (opt === value || optNorm === valNorm) {
            return { isExact: true, matchValue: opt, foundInSubfolder: false };
        }
    }
    // 2. Case-insensitive full path match
    for (const opt of options) {
        const optNorm = normalizePath(opt);
        if (optNorm.toLowerCase() === valLower) {
            return { isExact: true, matchValue: opt, foundInSubfolder: false };
        }
    }
    // 3. Basename match in a subfolder (e.g. options has "flux/model.safetensors" and value was "model.safetensors")
    for (const opt of options) {
        const optNorm = normalizePath(opt);
        const optBase = optNorm.split("/").pop() || "";
        if (optBase.toLowerCase() === valBaseLower) {
            return { isExact: false, matchValue: opt, foundInSubfolder: true };
        }
    }
    return { isExact: false, matchValue: null, foundInSubfolder: false };
}
export function scanMissingModelsFromGraph() {
    return scanMissingModelsWithStats().missing;
}
export function scanMissingModelsWithStats() {
    const graph = app?.graph;
    if (!graph)
        return { missing: [], total: 0 };
    // Collect all nodes including subgraphs and groups
    const allNodes = collectAllNodes(graph);
    const missing = [];
    const nodesWithMissing = new Set();
    let total = 0;
    for (const node of allNodes) {
        const widgets = node?.widgets || [];
        for (const widget of widgets) {
            const widgetName = widget?.name || "";
            const value = widget?.value;
            if (!value)
                continue;
            const options = resolveComboValues(widget);
            // Only scan widgets that have combo options or whose value is a model file
            if (options.length === 0 && !isModelFileName(String(value)))
                continue;
            if (!isModelWidget(node, widgetName, value))
                continue;
            total += 1;
            const match = findMatchInOptions(options, String(value));
            if (match.isExact) {
                // Already exact match on disk in the correct folder/option format
                continue;
            }
            // If found in a subfolder on disk (e.g. "flux/model.safetensors")
            const foundOnDisk = match.foundInSubfolder ? match.matchValue : null;
            const suggestedFix = match.foundInSubfolder ? match.matchValue : null;
            missing.push({
                node_id: node?.id ?? null,
                node_title: node?.title || node?.type || "",
                widget_name: widgetName,
                missing_value: String(value),
                type_hint: typeHintFromNode(node, widgetName),
                found_on_disk_path: foundOnDisk,
                suggested_fix: suggestedFix,
                node,
            });
            // Track nodes with missing models
            if (node?.id != null) {
                nodesWithMissing.add(node.id);
            }
            if (missing.length >= MAX_MISSING)
                break;
        }
        if (missing.length >= MAX_MISSING)
            break;
    }
    // Highlight nodes with missing models
    highlightNodesWithMissingModels(allNodes, nodesWithMissing);
    return { missing, total };
}
function highlightNodesWithMissingModels(allNodes, nodesWithMissing) {
    for (const node of allNodes) {
        if (!node)
            continue;
        if (nodesWithMissing.has(node.id)) {
            if (!node.__mjrMissingHighlight) {
                node.__mjrMissingHighlight = true;
                node.__mjrMissingColor = node.color ?? null;
                node.__mjrMissingBgcolor = node.bgcolor ?? null;
            }
            // Highlight node with missing models (border only)
            node.color = "#FF0000";
            node.bgcolor = null;
        }
        else if (node.__mjrMissingHighlight) {
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
    if (!graph)
        return 0;
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
        if (!fix)
            continue;
        const node = nodesById.get(fix.node_id);
        if (!node)
            continue;
        const widgets = node?.widgets || [];
        const widget = widgets.find((w) => w?.name === fix.widget_name);
        if (!widget)
            continue;
        widget.value = fix.new_value;
        // Ensure widget callbacks fire so nodes update internal state.
        if (typeof widget.callback === "function") {
            try {
                widget.callback(widget.value, app.graph, node, widget);
            }
            catch (_) { }
        }
        if (typeof node.onWidgetChanged === "function") {
            try {
                node.onWidgetChanged(widget.name, widget.value, widget);
            }
            catch (_) { }
        }
        if (typeof node.onPropertyChanged === "function") {
            try {
                node.onPropertyChanged(widget.name, widget.value, widget);
            }
            catch (_) { }
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
        }
        catch (_) { }
    }
    return fixed;
}
//# sourceMappingURL=model_fixer.js.map