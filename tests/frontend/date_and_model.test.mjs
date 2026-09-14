import assert from "node:assert/strict";
import test from "node:test";

import {
  token3Tag,
  extractDateFromPath,
  replaceDateInPath,
  resolveModel,
  yymmddJS,
} from "../../web/js/mjr/utils.js";

test("token3Tag extracts meaningful model names and handles parent directories", () => {
  // Checkpoint with parent folder for generic filenames
  const genericWithParent = token3Tag("FLUX.1-schnell/diffusion_pytorch_model.safetensors");
  assert.equal(genericWithParent, "Flux.1_Schnell");

  // Version normalization
  const v15 = token3Tag("v1-5-pruned-emaonly.safetensors");
  assert.equal(v15, "V1_5");

  // Noise tokens stripping
  const fluxDevFp8 = token3Tag("flux1-dev-fp8.safetensors");
  assert.equal(fluxDevFp8, "Flux1_Dev");

  // Standard checkpoint
  const sdxl = token3Tag("sd_xl_base_1.0.safetensors");
  assert.equal(sdxl, "Sd_Xl_Base");
});

test("extractDateFromPath handles YYMMDD, YYYYMMDD and ISO date formats", () => {
  // YYMMDD (6 digits)
  const d6 = extractDateFromPath("PROJECTS/Test/02_OUT/IMAGES/260911/Hero");
  assert.notEqual(d6, null);
  assert.equal(d6?.yymmdd, "260911");
  assert.equal(d6?.format, "yymmdd");

  // YYYYMMDD (8 digits)
  const d8 = extractDateFromPath("PROJECTS/Test/02_OUT/IMAGES/20260911/Hero");
  assert.notEqual(d8, null);
  assert.equal(d8?.yymmdd, "260911");
  assert.equal(d8?.format, "yyyymmdd");

  // ISO (YYYY-MM-DD)
  const dIso = extractDateFromPath("PROJECTS/Test/02_OUT/IMAGES/2026-09-11/Hero");
  assert.notEqual(dIso, null);
  assert.equal(dIso?.yymmdd, "260911");
  assert.equal(dIso?.format, "iso");

  // Prefix extraction
  const p6 = extractDateFromPath("260911_Shot01_");
  assert.notEqual(p6, null);
  assert.equal(p6?.yymmdd, "260911");
});

test("replaceDateInPath correctly updates date across formats", () => {
  // YYMMDD
  const r6 = replaceDateInPath("PROJECTS/Test/02_OUT/IMAGES/260510/Hero", "260911");
  assert.equal(r6, "PROJECTS/Test/02_OUT/IMAGES/260911/Hero");

  // Prefix YYMMDD
  const rp6 = replaceDateInPath("260510_Shot01_", "260911");
  assert.equal(rp6, "260911_Shot01_");

  // YYYYMMDD
  const r8 = replaceDateInPath("PROJECTS/Test/02_OUT/IMAGES/20260510/Hero", "260911");
  assert.equal(r8, "PROJECTS/Test/02_OUT/IMAGES/20260911/Hero");

  // ISO
  const rIso = replaceDateInPath("PROJECTS/Test/02_OUT/IMAGES/2026-05-10/Hero", "260911");
  assert.equal(rIso, "PROJECTS/Test/02_OUT/IMAGES/2026-09-11/Hero");
});

test("resolveModel honors custom model, detected tag, and fallback", () => {
  // Custom model enabled
  const customState = {
    useCustomModel: true,
    customModelText: "Flux_Custom_Hero",
    detectedModelTag: "Flux1_Dev",
  };
  const resolvedCustom = resolveModel(customState);
  assert.equal(resolvedCustom.isCustom, true);
  assert.equal(resolvedCustom.tag, "FLUX_CUSTOM_HERO");

  // Detected model tag
  const detectedState = {
    useCustomModel: false,
    detectedModelTag: "Flux1_Dev",
  };
  const resolvedDetected = resolveModel(detectedState);
  assert.equal(resolvedDetected.isCustom, false);
  assert.equal(resolvedDetected.tag, "Flux1_Dev");

  // Fallback
  const emptyState = {};
  const resolvedFallback = resolveModel(emptyState);
  assert.equal(resolvedFallback.tag, "Default");
});
