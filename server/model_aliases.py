"""
Système d'aliases pour les noms de modèles.
Permet de gérer les multiples noms pour un même modèle.
"""

from __future__ import annotations

from typing import Dict, List, Set
import re

# Base de données d'aliases connus (sera étendue au fil du temps)
MODEL_ALIASES = {
    # Stable Diffusion versions
    "sd15": [
        "stable-diffusion-1-5",
        "sd-1-5",
        "v1-5-pruned-emaonly",
        "sd_v15",
        "stable-diffusion-v1-5",
        "sd-v1.5",
        "sd1.5"
    ],
    "sd21": [
        "stable-diffusion-2-1",
        "sd-2-1",
        "v2-1_768-ema-pruned",
        "sd_v21",
        "stable-diffusion-v2-1",
        "sd-v2.1",
        "sd2.1"
    ],
    "sdxl": [
        "stable-diffusion-xl",
        "sd-xl",
        "sdxl-base-1.0",
        "sdxl10",
        "sdxl-1.0",
        "sd-xl-base",
        "stable-diffusion-xl-base-1.0"
    ],
    "sdxl-refiner": [
        "sdxl-refiner-1.0",
        "stable-diffusion-xl-refiner-1.0",
        "sd-xl-refiner"
    ],

    # Popular community models
    "dreamshaper": [
        "dreamshaper-8",
        "dreamshaper-7",
        "dreamshaper-8-lcm",
        "dreamshaper8",
        "dreamshaper7"
    ],
    "realisticvision": [
        "realistic-vision-v5",
        "realistic-vision-v6",
        "rvision",
        "realistic-vision",
        "realisticvisionv5",
        "realisticvisionv6"
    ],
    "deliberate": [
        "deliberate-v2",
        "deliberate-v3",
        "deliberatev2",
        "deliberatev3"
    ],

    # LoRAs
    "lcm": [
        "lcm-lora",
        "latent-consistency-model",
        "lcm-lora-sdv1-5",
        "lcm-lora-sdxl"
    ],

    # VAEs
    "vae-ft-mse": [
        "vae-ft-mse-840000-ema-pruned",
        "sd-vae-ft-mse",
        "vae-ft-mse-original"
    ],
    "sdxl-vae": [
        "sdxl-vae-fp16-fix",
        "sdxl_vae"
    ],

    # ControlNet
    "canny": [
        "control_v11p_sd15_canny",
        "controlnet-canny",
        "canny-controlnet"
    ],
    "depth": [
        "control_v11f1p_sd15_depth",
        "controlnet-depth",
        "depth-controlnet"
    ],
}

# Patterns de normalisation de version
VERSION_PATTERNS = [
    (r'[-_]v(\d+)', r'_v\1'),  # v1 -> _v1
    (r'[-_](\d+\.\d+)', r'_\1'),  # 1.5 -> _1.5
    (r'[-_]fp(\d+)', r'_fp\1'),  # fp16 -> _fp16
]


class AliasResolver:
    """Résout les aliases de modèles pour améliorer la recherche"""

    def __init__(self):
        # Construire un index inversé pour recherche rapide
        self.alias_to_canonical: Dict[str, str] = {}
        self.canonical_to_aliases: Dict[str, Set[str]] = {}

        for canonical, aliases in MODEL_ALIASES.items():
            self.canonical_to_aliases[canonical] = set(aliases)

            for alias in aliases:
                self.alias_to_canonical[alias.lower()] = canonical

            # Le canonical pointe aussi vers lui-même
            self.alias_to_canonical[canonical.lower()] = canonical

    def resolve(self, query: str) -> Set[str]:
        """
        Résout un nom de modèle en toutes ses variantes connues.

        Args:
            query: Nom du modèle à rechercher

        Returns:
            Set de toutes les variantes à essayer dans la recherche
        """
        query_lower = query.lower().strip()
        variants = {query}  # Toujours inclure l'original

        # Chercher dans les aliases connus
        canonical = self.alias_to_canonical.get(query_lower)
        if canonical:
            # Ajouter toutes les variantes connues
            variants.update(self.canonical_to_aliases.get(canonical, set()))
            variants.add(canonical)

        # Normaliser les versions
        for pattern, replacement in VERSION_PATTERNS:
            normalized = re.sub(pattern, replacement, query, flags=re.IGNORECASE)
            if normalized != query:
                variants.add(normalized)

        # Variantes de séparateurs
        variants.add(query.replace("_", "-"))
        variants.add(query.replace("-", "_"))
        variants.add(query.replace("_", " "))
        variants.add(query.replace("-", " "))

        # Version sans séparateurs
        clean = re.sub(r'[-_\s]+', '', query)
        if clean != query and len(clean) > 3:
            variants.add(clean)

        return variants

    def add_alias(self, canonical: str, alias: str):
        """
        Ajoute un nouvel alias dynamiquement.
        Utile pour apprendre de nouveaux aliases au runtime.
        """
        canonical_lower = canonical.lower()
        alias_lower = alias.lower()

        if canonical_lower not in self.canonical_to_aliases:
            self.canonical_to_aliases[canonical_lower] = set()

        self.canonical_to_aliases[canonical_lower].add(alias_lower)
        self.alias_to_canonical[alias_lower] = canonical_lower

    def get_canonical(self, query: str) -> str:
        """Retourne le nom canonique si connu, sinon l'original"""
        return self.alias_to_canonical.get(query.lower(), query)


# Instance globale
_alias_resolver = AliasResolver()


def get_alias_resolver() -> AliasResolver:
    """Retourne l'instance du résolveur d'aliases"""
    return _alias_resolver


def resolve_aliases(query: str) -> List[str]:
    """
    Fonction helper pour résoudre les aliases.

    Args:
        query: Nom du modèle

    Returns:
        Liste des variantes à essayer
    """
    return list(get_alias_resolver().resolve(query))
