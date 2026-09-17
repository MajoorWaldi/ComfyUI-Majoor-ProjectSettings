"""
Shared model kind constants used across model_downloader_routes,
model_fixer_routes, and other server modules.

Extracted here to break the circular import that existed when
model_fixer_routes imported TYPE_HINT_KIND from model_downloader_routes
at runtime.
"""

from __future__ import annotations

VALID_KINDS: frozenset[str] = frozenset({
    "checkpoints",
    "diffusion_models",
    "loras",
    "vae",
    "controlnet",
    "text_encoders",
    "clip",
    "clip_vision",
    "unet",
    "upscale_models",
    "embeddings",
})

ALL_MODEL_KINDS: list[str] = sorted(VALID_KINDS)

KIND_ALIASES: dict[str, str] = {
    "checkpoint": "checkpoints",
    "ckpt": "checkpoints",
    "lora": "loras",
    "text_encoder": "text_encoders",
    "text_encoders": "text_encoders",
    "diffusion": "diffusion_models",
}

TYPE_HINT_KIND: dict[str, str] = {
    "checkpoint": "checkpoints",
    "diffusion": "diffusion_models",
    "diffusion_models": "diffusion_models",
    "lora": "loras",
    "vae": "vae",
    "controlnet": "controlnet",
    "upscale_models": "upscale_models",
    "clip": "clip",
    "clip_vision": "clip_vision",
    "text_encoder": "text_encoders",
    "text_encoders": "text_encoders",
    "unet": "unet",
    "embeddings": "embeddings",
    "unknown": "",
}
