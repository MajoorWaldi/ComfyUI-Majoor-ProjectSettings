export function titlePathJS(text) {
    if (text == null)
        return "";
    let t = String(text).trim();
    if (t.normalize) {
        t = t.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
    }
    t = t.replace(/[\\/]/g, " ");
    const tokens = t.split(/[\s_-]+/).filter(Boolean);
    const titled = tokens.map((tok) => {
        if (tok.length <= 1)
            return tok.toUpperCase();
        return tok[0].toUpperCase() + tok.slice(1).toLowerCase();
    });
    return titled.join("_") || "Project";
}
export function token3Tag(raw, upper) {
    if (raw == null)
        return "";
    let t = String(raw).trim();
    if (!t)
        return "";
    if (t.normalize) {
        t = t.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
    }
    // Handle path: take basename, but if basename is generic (e.g. model, unet, diffusion_pytorch_model),
    // inspect parent directory!
    const normalizedPath = t.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/").filter(Boolean);
    let base = pathParts.pop() || "";
    const lastDot = base.lastIndexOf(".");
    if (lastDot > 0) {
        base = base.slice(0, lastDot);
    }
    const genericNames = new Set([
        "model",
        "checkpoint",
        "diffusion_pytorch_model",
        "unet",
        "transformer",
        "weights",
        "consolidated",
        "pytorch_model",
    ]);
    if (genericNames.has(base.toLowerCase()) && pathParts.length > 0) {
        base = pathParts[pathParts.length - 1];
    }
    // Handle version patterns like v1-5, v2-1 -> V1.5, V2.1
    base = base.replace(/([a-zA-Z]+)-(\d+)(?:-(\d+))?/g, (_m, p1, p2, p3) => {
        return p3 ? `${p1}${p2}.${p3}` : `${p1}${p2}`;
    });
    // Filter out noise suffixes if other descriptive tokens exist
    const rawTokens = base.split(/[\s_-]+/).filter(Boolean);
    const noiseTokens = new Set(["pruned", "emaonly", "fp16", "fp8", "bf16", "safetensors", "gguf", "bin", "ckpt"]);
    let meaningfulTokens = rawTokens.filter((tok) => !noiseTokens.has(tok.toLowerCase()));
    if (meaningfulTokens.length === 0) {
        meaningfulTokens = rawTokens;
    }
    const tokens = meaningfulTokens.slice(0, 3);
    if (!tokens.length)
        return "";
    if (upper) {
        return tokens.join("_").toUpperCase();
    }
    return tokens
        .map((tok) => tok.length <= 1 ? tok.toUpperCase() : tok[0].toUpperCase() + tok.slice(1).toLowerCase())
        .join("_");
}
export function yymmddJS(d = new Date()) {
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
}
export function isoDateJS(d = new Date()) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
export function yyyymmddJS(d = new Date()) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}
export function extractDateFromPath(text) {
    if (!text)
        return null;
    const s = String(text).replace(/\\/g, "/");
    // ISO: YYYY-MM-DD (e.g. 2026-09-11)
    const mIso = s.match(/(?:^|\/|_)(20\d{2})-(\d{2})-(\d{2})(?:$|\/|_)/);
    if (mIso) {
        const yy = mIso[1].slice(-2);
        return {
            raw: `${mIso[1]}-${mIso[2]}-${mIso[3]}`,
            yymmdd: `${yy}${mIso[2]}${mIso[3]}`,
            format: "iso",
        };
    }
    // 8 digits: YYYYMMDD (e.g. 20260911)
    const m8 = s.match(/(?:^|\/|_)(20\d{6})(?:$|\/|_)/);
    if (m8) {
        return {
            raw: m8[1],
            yymmdd: m8[1].slice(2),
            format: "yyyymmdd",
        };
    }
    // 6 digits: YYMMDD (e.g. 260911)
    const m6 = s.match(/(?:^|\/|_)(2\d{5})(?:$|\/|_)/);
    if (m6) {
        return {
            raw: m6[1],
            yymmdd: m6[1],
            format: "yymmdd",
        };
    }
    return null;
}
export function replaceDateInPath(text, newYYMMDD) {
    if (!text)
        return "";
    const ext = extractDateFromPath(text);
    if (!ext)
        return text;
    let replacement = newYYMMDD;
    if (ext.format === "yyyymmdd") {
        replacement = `20${newYYMMDD}`;
    }
    else if (ext.format === "iso") {
        replacement = `20${newYYMMDD.slice(0, 2)}-${newYYMMDD.slice(2, 4)}-${newYYMMDD.slice(4, 6)}`;
    }
    return text.split(ext.raw).join(replacement);
}
export function resolveModel(state) {
    if (state?.useCustomModel && state?.customModelText?.trim()) {
        const raw = state.customModelText.trim();
        const tag = token3Tag(raw, true);
        return {
            modelRaw: raw,
            tag: tag || "CUSTOM",
            isCustom: true,
            modelUpper: true,
        };
    }
    if (state?.detectedModelTag?.trim()) {
        const tag = state.detectedModelTag.trim();
        return {
            modelRaw: tag,
            tag,
            isCustom: false,
            modelUpper: false,
        };
    }
    if (state?.modelSelection && state.modelSelection !== "Unknown" && state.modelSelection !== "__custom__") {
        const raw = state.modelSelection;
        const tag = token3Tag(raw, false);
        return {
            modelRaw: raw,
            tag: tag || "MODEL",
            isCustom: false,
            modelUpper: false,
        };
    }
    return {
        modelRaw: "Default",
        tag: "Default",
        isCustom: false,
        modelUpper: false,
    };
}
export function safeRel(rel) {
    if (rel == null)
        return "";
    let r = String(rel).replace(/\\/g, "/").trim();
    r = r.replace(/^output\//i, "");
    r = r.replace(/^\/+/, "");
    r = r
        .split("/")
        .filter((p) => p && p !== "." && p !== "..")
        .join("/");
    return r;
}
export function joinRel(a, b) {
    const left = safeRel(a);
    const right = safeRel(b);
    if (!left)
        return right;
    if (!right)
        return left;
    return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}
export function mediaDir(media) {
    const m = String(media || "").toLowerCase();
    if (m === "videos")
        return "02_OUT/VIDEOS";
    if (m === "images")
        return "02_OUT/IMAGES";
    return "02_OUT/OTHER";
}
export function makeKindToken(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "asset")
        return "ASSET";
    if (k === "shot")
        return "SHOT";
    return "MISC";
}
/**
 * Validate that a path is relative and safe.
 */
function validateRelativePath(path, context) {
    if (path.startsWith("/") || path.startsWith("\\")) {
        throw new Error(`${context} must be relative`);
    }
    if (path.includes(":")) {
        throw new Error(`${context} must be relative`);
    }
    if (path.includes("..")) {
        throw new Error(`${context} contains '..'`);
    }
}
export function resolveTemplatePreview(template, tokens) {
    if (!template)
        return "";
    let out = template.replace(/\\/g, "/").trim();
    if (!out)
        return "";
    // Validate template before processing
    validateRelativePath(out, "template");
    if (!out.includes("{BASE}")) {
        throw new Error("template must include {BASE}");
    }
    // Replace tokens (use split/join to handle multiple occurrences safely)
    for (const [key, value] of Object.entries(tokens)) {
        const safeValue = String(value || "");
        // Prevent token values from containing other token patterns
        if (safeValue.includes("{") || safeValue.includes("}")) {
            throw new Error(`token value for {${key}} contains template markers`);
        }
        out = out.split(`{${key}}`).join(safeValue);
    }
    // Normalize slashes
    out = out.replace(/\\/g, "/").replace(/\/+/g, "/");
    // Validate resolved path
    validateRelativePath(out, "resolved path");
    const parts = out.split("/").filter(Boolean);
    // Verify base constraint
    const base = String(tokens?.BASE || "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (base) {
        if (!(out === base || out.startsWith(`${base}/`))) {
            throw new Error("template must stay under {BASE}");
        }
    }
    return parts.join("/");
}
//# sourceMappingURL=utils.js.map