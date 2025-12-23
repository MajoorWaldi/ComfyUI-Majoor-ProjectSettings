"""
Shared utility functions for API routes.
"""

from __future__ import annotations

import json
import os
from typing import Any

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
