"""
Structured audit logging for sensitive operations.

Writes JSON Lines events to a file under ComfyUI output/PROJECTS/_INDEX by default.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from aiohttp import web

from .project_store import safe_under_output


def _get_client_ip(request: web.Request) -> str:
    trust_proxy = str(os.environ.get("MJR_TRUST_PROXY", "")).strip().lower() in ("1", "true", "yes", "on")
    if trust_proxy:
        xff = (request.headers.get("X-Forwarded-For") or "").strip()
        if xff:
            return xff.split(",")[0].strip()
    return (request.remote or "").strip()


def _audit_log_path() -> Path:
    rel = (os.environ.get("MJR_AUDIT_LOG_PATH") or "PROJECTS/_INDEX/audit.log").strip()
    return safe_under_output(rel)


class AuditLogger:
    def __init__(self) -> None:
        self._lock = threading.Lock()

    def log_event(
        self,
        request: web.Request,
        *,
        action: str,
        resource: str,
        details: Dict[str, Any] | None = None,
        success: bool = True,
    ) -> None:
        try:
            path = _audit_log_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            event = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "action": str(action),
                "resource": str(resource),
                "client_ip": _get_client_ip(request),
                "success": bool(success),
                "details": details or {},
            }
            line = json.dumps(event, ensure_ascii=True, separators=(",", ":")) + "\n"
            with self._lock:
                path.open("a", encoding="utf-8").write(line)
        except Exception:
            # Audit logging must never break the request path.
            return


audit_logger = AuditLogger()

