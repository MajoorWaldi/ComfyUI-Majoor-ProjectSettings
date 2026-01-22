"""
Majoor Project Settings (standalone).
Frontend + API only (no nodes).
"""

WEB_DIRECTORY = "./js"

from .server import (  # noqa: F401
    model_downloader_routes,
    model_fixer_routes,
    model_registry_routes,
    project_routes,
)

# Required to keep ComfyUI from skipping this extension (no nodes on purpose).
NODE_CLASS_MAPPINGS = {}
NODES_LIST = []
