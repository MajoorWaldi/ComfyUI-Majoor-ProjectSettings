"""
API routes for community model registry.
"""

from __future__ import annotations

import logging
from aiohttp import web

from server import PromptServer

from .model_registry import get_model_registry
from .route_utils import (
    json_error,
    parse_json_body,
    require_json,
    require_same_origin,
    require_auth,
    require_rate_limit,
)
from .validators import InputValidator, ValidationError
from .audit_logger import audit_logger

MAX_REGISTRY_NAME_LENGTH = 255
MAX_REGISTRY_URL_LENGTH = 2048
MAX_REGISTRY_FILENAME_LENGTH = 255
MAX_REGISTRY_PLATFORM_LENGTH = 64
MAX_REGISTRY_TYPE_LENGTH = 64
MAX_REGISTRY_SHA_LENGTH = 64

logger = logging.getLogger(__name__)


@PromptServer.instance.routes.post("/mjr_models/registry/search")
async def mjr_models_registry_search(request: web.Request) -> web.Response:
    """Search in the community model registry."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_search")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    query = str(body.get("query", "")).strip()
    if not query:
        return json_error("query is required")

    if len(query) < 2:
        return json_error("query must be at least 2 characters")

    limit = int(body.get("limit", 5))
    if limit < 1 or limit > 20:
        limit = 5

    try:
        registry = get_model_registry()
        results = registry.search(query, limit)

        audit_logger.log_event(
            request,
            action="models.registry.search",
            resource="registry",
            details={"query_len": len(query), "results": len(results)},
            success=True,
        )

        return web.json_response({
            "ok": True,
            "results": results,
            "total": len(results)
        })
    except Exception:
        logger.exception("Registry search failed")
        return json_error("search failed", status=500)


@PromptServer.instance.routes.post("/mjr_models/registry/contribute")
async def mjr_models_registry_contribute(request: web.Request) -> web.Response:
    """Contribute a new model source to the community registry."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    name = str(body.get("name", "")).strip()
    url = str(body.get("url", "")).strip()
    platform = str(body.get("platform", "")).strip() or "unknown"

    if len(name) > MAX_REGISTRY_NAME_LENGTH:
        return json_error(f"name is too long (max {MAX_REGISTRY_NAME_LENGTH} characters)")
    if len(url) > MAX_REGISTRY_URL_LENGTH:
        return json_error(f"url is too long (max {MAX_REGISTRY_URL_LENGTH} characters)")
    if len(platform) > MAX_REGISTRY_PLATFORM_LENGTH:
        return json_error(f"platform is too long (max {MAX_REGISTRY_PLATFORM_LENGTH} characters)")

    if not name or not url:
        return json_error("name and url are required")

    filename = str(body.get("filename", "")).strip()
    sha256 = str(body.get("sha256", "")).strip()
    model_type = str(body.get("type", "checkpoints")).strip()
    size_mb = int(body.get("size_mb", 0))

    if filename and len(filename) > MAX_REGISTRY_FILENAME_LENGTH:
        return json_error(f"filename is too long (max {MAX_REGISTRY_FILENAME_LENGTH} characters)")
    if len(model_type) > MAX_REGISTRY_TYPE_LENGTH:
        return json_error(f"type is too long (max {MAX_REGISTRY_TYPE_LENGTH} characters)")

    try:
        if filename:
            InputValidator.validate_basename(filename)
    except ValidationError as e:
        return json_error(str(e))

    # Validate URL format
    from .model_downloader_routes import _validate_url
    ok, err = _validate_url(url)
    if not ok:
        return json_error(f"invalid url: {err}")

    # Validate SHA256 if provided
    if sha256:
        from .model_downloader_routes import _is_valid_sha256
        if len(sha256) > MAX_REGISTRY_SHA_LENGTH:
            return json_error("sha256 is too long")
        if not _is_valid_sha256(sha256):
            return json_error("invalid sha256 format")

    try:
        registry = get_model_registry()
        success = registry.add_source(
            name=name,
            url=url,
            platform=platform,
            filename=filename,
            sha256=sha256,
            model_type=model_type,
            size_mb=size_mb,
            verified=False  # User contributions start unverified
        )

        audit_logger.log_event(
            request,
            action="models.registry.contribute",
            resource="registry",
            details={"name": name, "platform": platform},
            success=success,
        )

        return web.json_response({
            "ok": True,
            "added": success,
            "message": "Thank you for your contribution!" if success else "Source already exists"
        })
    except Exception:
        logger.exception("Registry contribution failed")
        return json_error("contribution failed", status=500)


@PromptServer.instance.routes.post("/mjr_models/registry/vote")
async def mjr_models_registry_vote(request: web.Request) -> web.Response:
    """Vote for a model source (upvote/downvote)."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    name = str(body.get("name", "")).strip()
    url = str(body.get("url", "")).strip()
    vote_type = str(body.get("vote", "")).strip().lower()

    if not name or not url or vote_type not in ("up", "down"):
        return json_error("name, url, and vote (up/down) are required")

    try:
        registry = get_model_registry()

        if vote_type == "up":
            success = registry.upvote_source(name, url)
        else:
            success = registry.downvote_source(name, url)

        audit_logger.log_event(
            request,
            action=f"models.registry.vote.{vote_type}",
            resource="registry",
            details={"name": name},
            success=success,
        )

        return web.json_response({
            "ok": True,
            "voted": success,
            "vote_type": vote_type
        })
    except Exception:
        logger.exception("Registry vote failed")
        return json_error("vote failed", status=500)


@PromptServer.instance.routes.post("/mjr_models/registry/add_alias")
async def mjr_models_registry_add_alias(request: web.Request) -> web.Response:
    """Add an alias for a model."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_write")
    if rate_error:
        return rate_error
    origin_error = require_same_origin(request)
    if origin_error:
        return origin_error
    if not require_json(request):
        return json_error("Content-Type must be application/json", status=415)

    body, error = await parse_json_body(request)
    if error:
        return error

    name = str(body.get("name", "")).strip()
    alias = str(body.get("alias", "")).strip()

    if not name or not alias:
        return json_error("name and alias are required")

    try:
        registry = get_model_registry()
        success = registry.add_alias(name, alias)

        audit_logger.log_event(
            request,
            action="models.registry.add_alias",
            resource="registry",
            details={"name": name, "alias": alias},
            success=success,
        )

        return web.json_response({
            "ok": True,
            "added": success
        })
    except Exception:
        logger.exception("Registry add alias failed")
        return json_error("add alias failed", status=500)


@PromptServer.instance.routes.get("/mjr_models/registry/stats")
async def mjr_models_registry_stats(request: web.Request) -> web.Response:
    """Get statistics about the community registry."""
    auth_error = require_auth(request)
    if auth_error:
        return auth_error
    rate_error = require_rate_limit(request, "models_read")
    if rate_error:
        return rate_error

    try:
        registry = get_model_registry()
        stats = registry.get_stats()

        return web.json_response({
            "ok": True,
            **stats
        })
    except Exception:
        logger.exception("Registry stats failed")
        return json_error("stats failed", status=500)
