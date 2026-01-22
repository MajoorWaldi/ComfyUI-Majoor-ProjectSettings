import importlib.util
import unittest
from pathlib import Path


def _load_module(relpath: str):
    root = Path(__file__).resolve().parents[1]
    path = root / relpath
    spec = importlib.util.spec_from_file_location(relpath.replace("/", "_"), path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


validators = _load_module("server/validators.py")


class TestValidators(unittest.TestCase):
    def test_validate_project_id_ok(self):
        v = validators.InputValidator.validate_project_id("proj_123-ABC")
        self.assertEqual(v, "proj_123-ABC")

    def test_validate_project_id_rejects_empty(self):
        with self.assertRaises(validators.ValidationError):
            validators.InputValidator.validate_project_id("")

    def test_validate_project_id_rejects_reserved_windows(self):
        with self.assertRaises(validators.ValidationError):
            validators.InputValidator.validate_project_id("CON")

    def test_validate_relpath_rejects_absolute(self):
        with self.assertRaises(validators.ValidationError):
            validators.InputValidator.validate_relpath("/etc/passwd")

    def test_validate_relpath_rejects_traversal(self):
        with self.assertRaises(validators.ValidationError):
            validators.InputValidator.validate_relpath("../x")

    def test_validate_basename_ok(self):
        v = validators.InputValidator.validate_basename("file.txt")
        self.assertEqual(v, "file.txt")

    def test_validate_basename_rejects_path(self):
        with self.assertRaises(validators.ValidationError):
            validators.InputValidator.validate_basename("a/b.txt")

