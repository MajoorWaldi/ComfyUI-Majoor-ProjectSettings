const KIND_OPTIONS = [
  { value: "checkpoints", label: "Checkpoint" },
  { value: "diffusion_models", label: "Diffusion Model" },
  { value: "loras", label: "LoRA" },
  { value: "vae", label: "VAE" },
  { value: "controlnet", label: "ControlNet" },
  { value: "text_encoders", label: "Text Encoder" },
  { value: "clip", label: "CLIP" },
  { value: "clip_vision", label: "CLIP Vision" },
  { value: "unet", label: "UNet" },
  { value: "upscale_models", label: "Upscale Model" },
  { value: "embeddings", label: "Embedding" },
];

const TYPE_HINT_KIND = {
  checkpoint: "checkpoints",
  diffusion: "diffusion_models",
  diffusion_models: "diffusion_models",
  lora: "loras",
  vae: "vae",
  controlnet: "controlnet",
  upscale_models: "upscale_models",
  text_encoder: "text_encoders",
  text_encoders: "text_encoders",
  clip: "clip",
  clip_vision: "clip_vision",
  unet: "unet",
  embeddings: "embeddings",
  unknown: "",
};

import { collectRecipesFromWorkflowNotes } from "./workflow_note_recipes.js";

const ALLOWED_EXTENSIONS = [".safetensors", ".ckpt", ".pt", ".pth", ".bin"];

export function getKindOptions() {
  return KIND_OPTIONS.slice();
}

export function typeHintToKind(typeHint) {
  const key = String(typeHint || "").toLowerCase();
  return TYPE_HINT_KIND[key] || "";
}

export function getAllowedExtensions() {
  return ALLOWED_EXTENSIONS.slice();
}

export function isValidUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

export function extractFilenameFromUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  } catch (_) {
    return "";
  }
}

export function hasAllowedExtension(filename) {
  const name = String(filename || "").toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export function normalizeKey(value) {
  const text = String(value || "").replace(/\\/g, "/");
  const base = text.split("/").pop() || "";
  return base.split("?")[0].split("#")[0];
}

export function collectNoteRecipes(workflowJson) {
  return collectRecipesFromWorkflowNotes(workflowJson);
}
