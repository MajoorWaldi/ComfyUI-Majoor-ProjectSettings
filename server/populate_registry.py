"""
Script to populate the community registry with popular models.
Run this once to initialize the registry with well-known models.
"""

from __future__ import annotations

import logging
from .model_registry import get_model_registry

logger = logging.getLogger(__name__)

# Popular models with verified URLs
POPULAR_MODELS = [
    # Stable Diffusion 1.5
    {
        "name": "stable-diffusion-v1-5",
        "url": "https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors",
        "platform": "huggingface",
        "filename": "v1-5-pruned-emaonly.safetensors",
        "type": "checkpoints",
        "size_mb": 4096,
        "verified": True
    },
    # Stable Diffusion 2.1
    {
        "name": "stable-diffusion-2-1",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-2-1/resolve/main/v2-1_768-ema-pruned.safetensors",
        "platform": "huggingface",
        "filename": "v2-1_768-ema-pruned.safetensors",
        "type": "checkpoints",
        "size_mb": 5120,
        "verified": True
    },
    # SDXL Base
    {
        "name": "stable-diffusion-xl-base-1.0",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
        "platform": "huggingface",
        "filename": "sd_xl_base_1.0.safetensors",
        "type": "checkpoints",
        "size_mb": 6940,
        "verified": True
    },
    # SDXL Refiner
    {
        "name": "stable-diffusion-xl-refiner-1.0",
        "url": "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
        "platform": "huggingface",
        "filename": "sd_xl_refiner_1.0.safetensors",
        "type": "checkpoints",
        "size_mb": 6080,
        "verified": True
    },
    # VAE for SD 1.5
    {
        "name": "vae-ft-mse-840000-ema-pruned",
        "url": "https://huggingface.co/stabilityai/sd-vae-ft-mse-original/resolve/main/vae-ft-mse-840000-ema-pruned.safetensors",
        "platform": "huggingface",
        "filename": "vae-ft-mse-840000-ema-pruned.safetensors",
        "type": "vae",
        "size_mb": 335,
        "verified": True
    },
    # VAE for SDXL
    {
        "name": "sdxl-vae-fp16-fix",
        "url": "https://huggingface.co/madebyollin/sdxl-vae-fp16-fix/resolve/main/sdxl_vae.safetensors",
        "platform": "huggingface",
        "filename": "sdxl_vae.safetensors",
        "type": "vae",
        "size_mb": 335,
        "verified": True
    },
    # LCM LoRA for SD 1.5
    {
        "name": "lcm-lora-sdv1-5",
        "url": "https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/main/pytorch_lora_weights.safetensors",
        "platform": "huggingface",
        "filename": "pytorch_lora_weights.safetensors",
        "type": "loras",
        "size_mb": 135,
        "verified": True
    },
    # LCM LoRA for SDXL
    {
        "name": "lcm-lora-sdxl",
        "url": "https://huggingface.co/latent-consistency/lcm-lora-sdxl/resolve/main/pytorch_lora_weights.safetensors",
        "platform": "huggingface",
        "filename": "pytorch_lora_weights.safetensors",
        "type": "loras",
        "size_mb": 395,
        "verified": True
    },
]

# Aliases for popular models
ALIASES = [
    ("stable-diffusion-v1-5", "sd15"),
    ("stable-diffusion-v1-5", "sd-1-5"),
    ("stable-diffusion-v1-5", "sd_v15"),
    ("stable-diffusion-2-1", "sd21"),
    ("stable-diffusion-2-1", "sd-2-1"),
    ("stable-diffusion-xl-base-1.0", "sdxl"),
    ("stable-diffusion-xl-base-1.0", "sdxl-base"),
    ("stable-diffusion-xl-refiner-1.0", "sdxl-refiner"),
    ("vae-ft-mse-840000-ema-pruned", "vae-ft-mse"),
    ("vae-ft-mse-840000-ema-pruned", "sd-vae-ft-mse"),
    ("sdxl-vae-fp16-fix", "sdxl-vae"),
    ("lcm-lora-sdv1-5", "lcm-lora"),
    ("lcm-lora-sdv1-5", "lcm"),
]


def populate_registry(force: bool = False) -> dict:
    """
    Populate the registry with popular models.

    Args:
        force: If True, add models even if registry already has entries

    Returns:
        Dict with statistics about what was added
    """
    registry = get_model_registry()

    # Check if registry is already populated
    stats = registry.get_stats()
    if stats["total_models"] > 0 and not force:
        logger.info(f"Registry already has {stats['total_models']} models, skipping population")
        return {
            "skipped": True,
            "reason": "registry already populated",
            "existing_models": stats["total_models"]
        }

    added_models = 0
    added_aliases = 0
    errors = []

    logger.info(f"Populating registry with {len(POPULAR_MODELS)} popular models...")

    # Add popular models
    for model in POPULAR_MODELS:
        try:
            success = registry.add_source(**model)
            if success:
                added_models += 1
                logger.info(f"Added {model['name']}")
            else:
                logger.debug(f"Skipped {model['name']} (already exists)")
        except Exception as e:
            error_msg = f"Failed to add {model['name']}: {e}"
            logger.error(error_msg)
            errors.append(error_msg)

    # Add aliases
    logger.info(f"Adding {len(ALIASES)} aliases...")
    for name, alias in ALIASES:
        try:
            success = registry.add_alias(name, alias)
            if success:
                added_aliases += 1
                logger.debug(f"Added alias: {name} -> {alias}")
        except Exception as e:
            error_msg = f"Failed to add alias {alias}: {e}"
            logger.error(error_msg)
            errors.append(error_msg)

    result = {
        "success": True,
        "added_models": added_models,
        "added_aliases": added_aliases,
        "errors": errors,
        "total_models": len(POPULAR_MODELS),
        "total_aliases": len(ALIASES)
    }

    logger.info(f"Registry population complete: {added_models}/{len(POPULAR_MODELS)} models added")

    return result


if __name__ == "__main__":
    # Run as standalone script
    logging.basicConfig(level=logging.INFO)
    result = populate_registry(force=True)
    print(f"\nRegistry Population Results:")
    print(f"  Models added: {result['added_models']}/{result['total_models']}")
    print(f"  Aliases added: {result['added_aliases']}/{result['total_aliases']}")
    if result.get('errors'):
        print(f"  Errors: {len(result['errors'])}")
        for error in result['errors'][:5]:  # Show first 5 errors
            print(f"    - {error}")
