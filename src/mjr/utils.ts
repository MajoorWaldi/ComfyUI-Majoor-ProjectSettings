export function titlePathJS(text) {
  if (text == null) return "";
  let t = String(text).trim();
  if (t.normalize) {
    t = t.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  }
  t = t.replace(/[\\/]/g, " ");
  const tokens = t.split(/[\s_-]+/).filter(Boolean);
  const titled = tokens.map((tok) => {
    if (tok.length <= 1) return tok.toUpperCase();
    return tok[0].toUpperCase() + tok.slice(1).toLowerCase();
  });
  return titled.join("_") || "Project";
}

export function token3Tag(raw, upper) {
  if (raw == null) return "";
  let t = String(raw).trim();
  if (!t) return "";
  if (t.normalize) {
    t = t.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  }
  t = t.replace(/\\/g, "/").split("/").pop();
  const lastDot = t.lastIndexOf(".");
  if (lastDot > 0) {
    t = t.slice(0, lastDot);
  }
  const tokens = t.split(/[\s_-]+/).filter(Boolean).slice(0, 3);
  if (!tokens.length) return "";
  if (upper) {
    return tokens.join("_").toUpperCase();
  }
  return tokens
    .map((tok) =>
      tok.length <= 1 ? tok.toUpperCase() : tok[0].toUpperCase() + tok.slice(1).toLowerCase()
    )
    .join("_");
}

export function yymmddJS() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function safeRel(rel) {
  if (rel == null) return "";
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
  if (!left) return right;
  if (!right) return left;
  return `${left.replace(/\/+$/, "")}/${right.replace(/^\/+/, "")}`;
}

export function mediaDir(media) {
  const m = String(media || "").toLowerCase();
  if (m === "videos") return "02_OUT/VIDEOS";
  if (m === "images") return "02_OUT/IMAGES";
  return "02_OUT/OTHER";
}

export function makeKindToken(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "asset") return "ASSET";
  if (k === "shot") return "SHOT";
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
  if (!template) return "";
  let out = template.replace(/\\/g, "/").trim();
  if (!out) return "";

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
