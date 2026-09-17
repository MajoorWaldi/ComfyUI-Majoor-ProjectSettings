"""
Shared utility functions for API routes.
"""

from __future__ import annotations

import json
import os
import secrets
import time
import ipaddress
import threading
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
    Require mutating browser requests to come from the same origin as ComfyUI.

    Requests without an Origin header are allowed because same-origin fetches,
    CLI clients, and some desktop contexts may omit it. Set
    MJR_DISABLE_SAME_ORIGIN=1 only for trusted local debugging.
    """
    if to_bool(os.environ.get("MJR_DISABLE_SAME_ORIGIN")):
        return None

    origin = (request.headers.get("Origin") or "").strip()
    if not origin:
        return None

    host_header = (request.headers.get("Host") or "").strip()
    if not host_header:
        return json_error("missing Host header", status=403)

    origin_host, origin_port = _parse_host_port(origin)
    host, host_port = _parse_host_port(host_header)
    if not origin_host or not host:
        return json_error("invalid origin", status=403)

    origin_scheme = urlparse(origin).scheme.lower()
    default_port = _default_port_for_scheme(origin_scheme)
    origin_port = origin_port or default_port
    host_port = host_port or default_port

    if origin_host != host or origin_port != host_port:
        return json_error("cross-origin request blocked", status=403)

    if to_bool(os.environ.get("MJR_DISABLE_CSRF")):
        return None

    expected_key = (os.environ.get("MJR_API_KEY") or "").strip()
    provided_key = _api_key_from_request(request)
    if expected_key and secrets.compare_digest(provided_key, expected_key):
        return None

    cookie_token = (request.cookies.get("mjr_csrf") or "").strip()
    header_token = (request.headers.get("X-CSRF-Token") or "").strip()
    if not cookie_token or not header_token:
        return json_error("missing CSRF token", status=403)
    if not secrets.compare_digest(cookie_token, header_token):
        return json_error("invalid CSRF token", status=403)
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
    if ip in ("127.0.0.1", "::1", "localhost"):
        return True
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return False


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
    Require an API key for non-loopback clients.

    If MJR_API_KEY is set, every client must provide it as either
    Authorization: Bearer <key> or X-MJR-API-Key. If no key is configured,
    only loopback clients are allowed by default.
    """
    if to_bool(os.environ.get("MJR_INSECURE_NO_AUTH")):
        return None

    expected_key = (os.environ.get("MJR_API_KEY") or "").strip()
    provided_key = _api_key_from_request(request)
    if expected_key:
        if secrets.compare_digest(provided_key, expected_key):
            return None
        return json_error("unauthorized", status=401)

    client_ip = _get_client_ip(request)
    if _is_loopback_ip(client_ip):
        return None

    return json_error("unauthorized: configure MJR_API_KEY for remote access", status=401)


_rate_lock = threading.Lock()
_rate_state: dict[tuple[str, str], list[float]] = {}


def require_rate_limit(request: web.Request, bucket: str) -> web.Response | None:
    """
    Apply a simple per-client, per-bucket rate limit.
    """
    raw_limit = os.environ.get("MJR_RATE_LIMIT_PER_MIN", "120")
    try:
        limit = int(raw_limit)
    except (TypeError, ValueError):
        limit = 120
    if limit <= 0:
        return None

    now = time.monotonic()
    cutoff = now - 60.0
    key = (_get_client_ip(request), bucket)
    with _rate_lock:
        hits = [ts for ts in _rate_state.get(key, []) if ts >= cutoff]
        if len(hits) >= limit:
            _rate_state[key] = hits
            return json_error("rate limit exceeded", status=429)
        hits.append(now)
        _rate_state[key] = hits
        # Purge stale keys when the dict grows large to prevent unbounded memory usage.
        if len(_rate_state) > 5000:
            stale = [k for k, v in _rate_state.items() if not any(t >= cutoff for t in v)]
            for k in stale:
                del _rate_state[k]
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
