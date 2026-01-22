"""
Centralized input validation helpers.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


class ValidationError(ValueError):
    pass


_RESERVED_WINDOWS_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


@dataclass(frozen=True)
class InputValidator:
    SAFE_PROJECT_ID = re.compile(r"^[a-zA-Z0-9_-]+$")
    SAFE_FILENAME = re.compile(r"^[a-zA-Z0-9._ -]+$")

    @staticmethod
    def validate_project_id(value: str, *, max_len: int = 255) -> str:
        v = str(value or "").strip()
        if not v:
            raise ValidationError("project_id is required")
        if len(v) > max_len:
            raise ValidationError(f"project_id is too long (max {max_len})")
        if not InputValidator.SAFE_PROJECT_ID.match(v):
            raise ValidationError("project_id contains invalid characters")
        if v.upper() in _RESERVED_WINDOWS_NAMES:
            raise ValidationError(f"'{v}' is a reserved name")
        return v

    @staticmethod
    def validate_basename(value: str, *, max_len: int = 255, allowed_exts: Iterable[str] | None = None) -> str:
        v = str(value or "").strip()
        if not v:
            raise ValidationError("filename is required")
        if len(v) > max_len:
            raise ValidationError(f"filename is too long (max {max_len})")
        if "/" in v or "\\" in v or ":" in v or ".." in v:
            raise ValidationError("filename must be a basename")
        if not InputValidator.SAFE_FILENAME.match(v):
            raise ValidationError("filename contains invalid characters")
        if allowed_exts is not None:
            lower = v.lower()
            if not any(lower.endswith(ext.lower()) for ext in allowed_exts):
                raise ValidationError("unsupported file extension")
        if v.upper() in _RESERVED_WINDOWS_NAMES:
            raise ValidationError(f"'{v}' is a reserved name")
        return v

    @staticmethod
    def validate_relpath(value: str, *, max_len: int = 1024) -> str:
        v = str(value or "").replace("\\", "/").strip()
        if not v:
            raise ValidationError("path is required")
        if len(v) > max_len:
            raise ValidationError(f"path is too long (max {max_len})")
        if v.startswith("/") or v.startswith("\\"):
            raise ValidationError("absolute paths are not allowed")
        if ":" in v:
            raise ValidationError("drive paths are not allowed")
        if ".." in v:
            raise ValidationError("path traversal detected")
        return v

