"""
Shared utility functions for API routes.
"""

from __future__ import annotations

import json
import os
import secrets
import time
import ipaddress
from urllib.parse import urlparse
from typing import Any, Tuple

from aiohttp import web


def json_error(message: str, status: int = 400) -> web.Response:
    """
    Create a JSON error response.

    Args:
        message: Error message to return
        status: HTTP status code (default: 400)

    Returns:
        JSON response with {"ok": False, "error": message}
    """
    return web.json_response({"ok": False, "error": message}, status=status)


def require_json(request: web.Request) -> bool:
    """
    Validate that request has JSON content-type.

    Args:
        request: The aiohttp request object

    Returns:
        True if Content-Type includes application/json
    """
    content_type = request.headers.get("Content-Type", "")
    return "application/json" in content_type.lower()

def _default_port_for_scheme(scheme: str | None) -> int | None:
    scheme = (scheme or "").lower()
    if scheme == "https":
        return 443
    if scheme == "http":
        return 80
    return None


def _parse_host_port(value: str, default_port: int | None = None) -> Tuple[str, int | None]:
    if not value:
        return "", default_port
    parsed = urlparse(value if value.startswith(("http://", "https://")) else f"//{value}")
    host = (parsed.hostname or "").strip().lower()
    port = parsed.port or default_port
    return host, port


def require_same_origin(request: web.Request) -> web.Response | None:
    """
    Temporary override: Security disabled.
    """
    return None


def _get_client_ip(request: web.Request) -> str:
    """
    Best-effort client IP extraction.
    """
    trust_proxy = str(os.environ.get("MJR_TRUST_PROXY", "")).strip().lower() in ("1", "true", "yes", "on")
    if trust_proxy:
        xff = (request.headers.get("X-Forwarded-For") or "").strip()
        if xff:
            return xff.split(",")[0].strip()
    return (request.remote or "").strip()


def _is_loopback_ip(ip: str) -> bool:
    return ip in ("127.0.0.1", "::1")


def _is_private_ip(ip_str: str) -> bool:
    """Check if IP is loopback or private (LAN)."""
    if not ip_str:
        return False
    # Quick string check for common localhost
    if ip_str in ("127.0.0.1", "::1", "localhost"):
        return True
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_loopback or ip.is_private
    except ValueError:
        return False


def _api_key_from_request(request: web.Request) -> str:
    auth = (request.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return (request.headers.get("X-MJR-API-Key") or "").strip()


def require_auth(request: web.Request) -> web.Response | None:
    """
    Temporary override: Security disabled.
    """
    return None


_rate_lock = None
_rate_state: dict[tuple[str, str], list[float]] = {}


def require_rate_limit(request: web.Request, bucket: str) -> web.Response | None:
    """
    Temporary override: Security disabled.
    """
    return None


def to_bool(value: Any) -> bool:
    """
    Convert various types to boolean.

    Args:
        value: Value to convert (bool, str, int, None, etc.)

    Returns:
        Boolean representation of the value

    Examples:
        >>> to_bool(True)
        True
        >>> to_bool("yes")
        True
        >>> to_bool("1")
        True
        >>> to_bool(None)
        False
        >>> to_bool("false")
        False
    """
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def basename(value: str) -> str:
    """
    Extract basename from a path, handling both Unix and Windows separators.

    Args:
        value: Path string

    Returns:
        Basename of the path

    Examples:
        >>> basename("/path/to/file.txt")
        'file.txt'
        >>> basename("C:\\\\Windows\\\\file.txt")
        'file.txt'
    """
    return os.path.basename(str(value or "").replace("\\", "/"))


async def parse_json_body(request: web.Request) -> tuple[dict[str, Any] | None, web.Response | None]:
    """
    Parse JSON request body with error handling.

    Args:
        request: The aiohttp request object

    Returns:
        Tuple of (parsed_body, error_response)
        - If successful: (body_dict, None)
        - If failed: (None, error_response)

    Example:
        body, error = await parse_json_body(request)
        if error:
            return error
        # Use body...
    """
    try:
        body = await request.json()
        if not isinstance(body, dict):
            return None, json_error("request body must be a JSON object")
        return body, None
    except json.JSONDecodeError as e:
        return None, json_error(f"invalid JSON: {e}")
    except ValueError as e:
        return None, json_error(f"invalid JSON: {e}")
    except UnicodeDecodeError as e:
        return None, json_error(f"invalid encoding: {e}")
    except TypeError as e:
        return None, json_error(f"invalid JSON type: {e}")
