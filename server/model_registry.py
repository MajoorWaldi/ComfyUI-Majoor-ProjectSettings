"""
Registre communautaire de modèles.
Base de données locale partagée d'URLs vérifiées de modèles.
"""

from __future__ import annotations

import json
import hashlib
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from threading import Lock

logger = logging.getLogger(__name__)


class ModelRegistry:
    """
    Registre communautaire de modèles.

    Structure du fichier JSON:
    {
        "schema": 1,
        "updated_at": "2026-01-22T10:30:00",
        "models": {
            "model_hash": {
                "names": ["stable-diffusion-v1-5", "sd-v1-5", "sd15"],
                "aliases": [...],
                "sources": [
                    {
                        "url": "https://...",
                        "platform": "huggingface",
                        "filename": "model.safetensors",
                        "verified": true,
                        "verified_at": "2026-01-20",
                        "sha256": "abc123...",
                        "upvotes": 10,
                        "downvotes": 0,
                        "last_checked": "2026-01-22",
                        "size_mb": 4096
                    }
                ],
                "metadata": {
                    "type": "checkpoint",
                    "base_model": "sd15",
                    "tags": ["realistic", "general"],
                    "description": "..."
                }
            }
        }
    }
    """

    def __init__(self, registry_path: Path = None):
        if registry_path is None:
            from .project_store import safe_under_output
            registry_path = safe_under_output("PROJECTS/_INDEX/model_registry.json")

        self.registry_path = registry_path
        self.lock = Lock()
        self.data = self._load()

    def _load(self) -> Dict[str, Any]:
        """Charge le registre depuis le disque"""
        if not self.registry_path.exists():
            return self._create_empty()

        try:
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if data.get("schema") != 1:
                logger.warning("Registry schema mismatch, resetting")
                return self._create_empty()

            return data
        except Exception as e:
            logger.error(f"Failed to load registry: {e}")
            return self._create_empty()

    def _create_empty(self) -> Dict[str, Any]:
        """Crée un registre vide"""
        return {
            "schema": 1,
            "updated_at": datetime.now().isoformat(),
            "models": {}
        }

    def _save(self):
        """Sauvegarde le registre sur disque (atomic)"""
        try:
            self.registry_path.parent.mkdir(parents=True, exist_ok=True)

            # Atomic write
            temp_path = self.registry_path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)

            temp_path.replace(self.registry_path)
            logger.debug(f"Registry saved to {self.registry_path}")

        except Exception as e:
            logger.error(f"Failed to save registry: {e}")

    def _normalize_name(self, name: str) -> str:
        """Normalise un nom de modèle pour recherche"""
        import re
        s = name.lower().strip()
        # Supprimer extensions
        s = re.sub(r'\.(safetensors|ckpt|pt|pth|bin)$', '', s)
        # Remplacer séparateurs par espaces
        s = re.sub(r'[-_\.]+', ' ', s)
        # Supprimer caractères spéciaux
        s = re.sub(r'[^a-z0-9\s]', '', s)
        # Espaces multiples
        s = re.sub(r'\s+', ' ', s).strip()
        return s

    def _compute_model_hash(self, normalized_name: str) -> str:
        """Calcule un hash unique pour un modèle"""
        return hashlib.sha256(normalized_name.encode('utf-8')).hexdigest()[:16]

    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Recherche dans le registre communautaire.

        Args:
            query: Nom du modèle recherché
            limit: Nombre max de résultats

        Returns:
            Liste de sources trouvées avec score >= 80
        """
        results = []
        query_norm = self._normalize_name(query)

        with self.lock:
            for model_hash, model_data in self.data.get("models", {}).items():
                # Chercher dans les noms et aliases
                names = model_data.get("names", [])
                aliases = model_data.get("aliases", [])
                all_names = names + aliases

                # Score de matching
                from .model_search_api import calculate_match_score

                best_score = 0
                best_match_name = ""

                for name in all_names:
                    score, _ = calculate_match_score(query, name)
                    if score > best_score:
                        best_score = score
                        best_match_name = name

                if best_score < 80:
                    continue

                # Récupérer les sources vérifiées et valides
                sources = model_data.get("sources", [])
                verified_sources = [
                    s for s in sources
                    if s.get("verified") and s.get("upvotes", 0) > s.get("downvotes", 0)
                ]

                if not verified_sources:
                    # Essayer sources non vérifiées mais avec upvotes
                    verified_sources = [
                        s for s in sources
                        if s.get("upvotes", 0) > s.get("downvotes", 0)
                    ]

                if not verified_sources:
                    continue

                # Trier par score (upvotes - downvotes)
                verified_sources.sort(
                    key=lambda s: s.get("upvotes", 0) - s.get("downvotes", 0),
                    reverse=True
                )

                # Prendre la meilleure source
                best_source = verified_sources[0]
                metadata = model_data.get("metadata", {})

                results.append({
                    "platform": "community_registry",
                    "name": best_match_name,
                    "filename": best_source.get("filename", ""),
                    "url": best_source["url"],
                    "page_url": best_source.get("page_url", best_source["url"]),
                    "type": metadata.get("type", "checkpoints"),
                    "version": "verified",
                    "size_mb": best_source.get("size_mb", 0),
                    "sha256": best_source.get("sha256"),
                    "match_score": best_score + 5,  # Bonus pour source communautaire
                    "match_level": f"Community verified ({best_source.get('upvotes', 0)}↑)",
                    "upvotes": best_source.get("upvotes", 0),
                    "verified_at": best_source.get("verified_at"),
                })

        results.sort(key=lambda x: x.get("match_score", 0), reverse=True)
        return results[:limit]

    def add_source(
        self,
        name: str,
        url: str,
        platform: str,
        filename: str = "",
        sha256: str = "",
        model_type: str = "checkpoints",
        size_mb: int = 0,
        verified: bool = False
    ) -> bool:
        """
        Ajoute une nouvelle source pour un modèle.

        Args:
            name: Nom du modèle
            url: URL de téléchargement
            platform: Plateforme (huggingface, civitai, etc.)
            filename: Nom du fichier
            sha256: Hash SHA256 (optionnel)
            model_type: Type de modèle
            size_mb: Taille en MB
            verified: Si la source a été vérifiée

        Returns:
            True si ajouté avec succès
        """
        normalized_name = self._normalize_name(name)
        model_hash = self._compute_model_hash(normalized_name)

        with self.lock:
            models = self.data.setdefault("models", {})

            if model_hash not in models:
                models[model_hash] = {
                    "names": [name],
                    "aliases": [],
                    "sources": [],
                    "metadata": {
                        "type": model_type,
                        "tags": [],
                        "description": ""
                    }
                }

            model_data = models[model_hash]

            # Ajouter le nom s'il n'existe pas
            if name not in model_data["names"]:
                model_data["names"].append(name)

            # Vérifier si l'URL existe déjà
            existing_urls = [s.get("url") for s in model_data.get("sources", [])]
            if url in existing_urls:
                logger.info(f"Source {url} already exists for {name}")
                return False

            # Ajouter la nouvelle source
            source = {
                "url": url,
                "platform": platform,
                "filename": filename,
                "verified": verified,
                "verified_at": datetime.now().isoformat() if verified else None,
                "sha256": sha256,
                "size_mb": size_mb,
                "upvotes": 1 if verified else 0,
                "downvotes": 0,
                "last_checked": datetime.now().isoformat(),
            }

            model_data["sources"].append(source)

            self.data["updated_at"] = datetime.now().isoformat()
            self._save()

            logger.info(f"Added source for {name}: {url}")
            return True

    def add_alias(self, name: str, alias: str) -> bool:
        """Ajoute un alias pour un modèle"""
        normalized_name = self._normalize_name(name)
        model_hash = self._compute_model_hash(normalized_name)

        with self.lock:
            models = self.data.get("models", {})
            if model_hash in models:
                aliases = models[model_hash].setdefault("aliases", [])
                if alias not in aliases:
                    aliases.append(alias)
                    self._save()
                    return True
        return False

    def upvote_source(self, name: str, url: str) -> bool:
        """Vote positif pour une source"""
        normalized_name = self._normalize_name(name)
        model_hash = self._compute_model_hash(normalized_name)

        with self.lock:
            models = self.data.get("models", {})
            if model_hash in models:
                for source in models[model_hash].get("sources", []):
                    if source.get("url") == url:
                        source["upvotes"] = source.get("upvotes", 0) + 1
                        source["last_checked"] = datetime.now().isoformat()
                        self._save()
                        return True
        return False

    def downvote_source(self, name: str, url: str) -> bool:
        """Vote négatif pour une source (lien mort, etc.)"""
        normalized_name = self._normalize_name(name)
        model_hash = self._compute_model_hash(normalized_name)

        with self.lock:
            models = self.data.get("models", {})
            if model_hash in models:
                for source in models[model_hash].get("sources", []):
                    if source.get("url") == url:
                        source["downvotes"] = source.get("downvotes", 0) + 1
                        source["last_checked"] = datetime.now().isoformat()
                        self._save()
                        return True
        return False

    def get_stats(self) -> Dict[str, Any]:
        """Retourne des statistiques sur le registre"""
        with self.lock:
            models = self.data.get("models", {})
            total_sources = sum(
                len(m.get("sources", [])) for m in models.values()
            )
            verified_sources = sum(
                sum(1 for s in m.get("sources", []) if s.get("verified"))
                for m in models.values()
            )

            return {
                "total_models": len(models),
                "total_sources": total_sources,
                "verified_sources": verified_sources,
                "updated_at": self.data.get("updated_at", "")
            }


# Instance globale
_registry: Optional[ModelRegistry] = None


def get_model_registry() -> ModelRegistry:
    """Retourne l'instance du registre (singleton)"""
    global _registry
    if _registry is None:
        _registry = ModelRegistry()
    return _registry
