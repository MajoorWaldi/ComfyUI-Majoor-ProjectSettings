"""
Registre communautaire de modèles.
Base de données locale partagée d'URLs vérifiées de modèles.
"""

from __future__ import annotations

import json
import hashlib
import logging
import uuid
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
        """Load the registry from disk."""
        if not self.registry_path.exists():
            return self._create_empty()

        try:
            # Guard against unexpectedly large files before reading.
            try:
                file_size = self.registry_path.stat().st_size
                if file_size > 10 * 1024 * 1024:  # 10 MB
                    logger.error("Registry file too large (%d bytes), resetting", file_size)
                    return self._create_empty()
            except OSError:
                pass

            with open(self.registry_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            if data.get("schema") != 1:
                logger.warning("Registry schema mismatch, resetting")
                return self._create_empty()

            return data
        except Exception as e:
            logger.error("Failed to load registry: %s", e)
            return self._create_empty()

    def _create_empty(self) -> Dict[str, Any]:
        """Create an empty registry."""
        return {
            "schema": 1,
            "updated_at": datetime.now().isoformat(),
            "models": {}
        }

    def _save(self):
        """Save the registry to disk atomically using a UUID-based temp file."""
        try:
            self.registry_path.parent.mkdir(parents=True, exist_ok=True)

            # Use a UUID-based temp name to prevent race conditions on concurrent saves.
            temp_path = self.registry_path.with_name(
                f"{self.registry_path.name}.{uuid.uuid4().hex}.tmp"
            )
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)

            temp_path.replace(self.registry_path)
            logger.debug("Registry saved to %s", self.registry_path)

        except Exception as e:
            logger.error("Failed to save registry: %s", e)

    def _normalize_name(self, name: str) -> str:
        """Normalize a model name for search (lowercase, no extensions or separators)."""
        import re
        s = name.lower().strip()
        s = re.sub(r'\.(safetensors|ckpt|pt|pth|bin)$', '', s)
        s = re.sub(r'[-_\.]+', ' ', s)
        s = re.sub(r'[^a-z0-9\s]', '', s)
        s = re.sub(r'\s+', ' ', s).strip()
        return s

    def _compute_model_hash(self, normalized_name: str) -> str:
        """Compute a stable hash key for a model name."""
        return hashlib.sha256(normalized_name.encode('utf-8')).hexdigest()[:16]

    def search(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Search the community registry for models matching the query.

        Args:
            query: Model name to search for
            limit: Maximum number of results

        Returns:
            List of sources with match_score >= 80
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
        Add a new download source for a model.

        Args:
            name: Model name
            url: Download URL
            platform: Hosting platform (huggingface, civitai, etc.)
            filename: Filename on disk
            sha256: SHA-256 hash (optional)
            model_type: Model type (checkpoints, loras, …)
            size_mb: Size in MB
            verified: Whether the source has been verified

        Returns:
            True if the source was added successfully
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
        """Add an alias for a model."""
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
        """Upvote a source (mark as helpful)."""
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
        """Downvote a source (broken link, wrong file, etc.)."""
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
        """Return statistics about the registry."""
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


# Global singleton with double-checked locking to prevent duplicate init under concurrency.
_registry: Optional[ModelRegistry] = None
_registry_lock = Lock()


def get_model_registry() -> ModelRegistry:
    """Return the singleton ModelRegistry instance (thread-safe)."""
    global _registry
    if _registry is None:
        with _registry_lock:
            if _registry is None:
                _registry = ModelRegistry()
    return _registry
