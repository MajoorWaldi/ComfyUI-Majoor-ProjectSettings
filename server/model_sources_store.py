"""
Model download recipes storage (safe under output/PROJECTS/_INDEX).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from .project_store import read_json, safe_under_output, write_json_atomic

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1


def _sources_path() -> Path:
    return safe_under_output("PROJECTS/_INDEX/model_sources.json")


def _basename(value: str) -> str:
    return os.path.basename(str(value or "").replace("\\", "/"))


def load_sources() -> Dict[str, Any]:
    path = _sources_path()
    data = read_json(path, {}, strict=False)
    if not isinstance(data, dict) or data.get("schema") != SCHEMA_VERSION:
        return {"schema": SCHEMA_VERSION, "updated_at": "", "items": []}
    items = data.get("items")
    if not isinstance(items, list):
        items = []
    return {
        "schema": SCHEMA_VERSION,
        "updated_at": str(data.get("updated_at") or ""),
        "items": items,
    }


def resolve_recipes(missing: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    data = load_sources()
    by_key = {}
    for item in data.get("items") or []:
        key = item.get("key")
        if isinstance(key, str) and key:
            by_key[key] = item

    resolved = []
    for entry in missing or []:
        missing_value = str((entry or {}).get("missing_value") or "")
        key = _basename(missing_value)
        recipe = by_key.get(key)
        kind = recipe.get("kind") if isinstance(recipe, dict) else ""
        resolved.append(
            {
                "missing_value": missing_value,
                "key": key,
                "kind": kind or "",
                "recipe": recipe if recipe else None,
            }
        )
    return resolved


def save_recipes(items: List[Dict[str, Any]]) -> None:
    data = load_sources()
    merged = {}
    for item in data.get("items") or []:
        key = item.get("key")
        if isinstance(key, str) and key:
            merged[key] = item

    for item in items or []:
        key = item.get("key")
        if not isinstance(key, str) or not key:
            continue
        merged[key] = item

    updated_at = datetime.now().isoformat()
    payload = {
        "schema": SCHEMA_VERSION,
        "updated_at": updated_at,
        "items": sorted(merged.values(), key=lambda x: x.get("key", "")),
    }
    path = _sources_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    write_json_atomic(path, payload)
