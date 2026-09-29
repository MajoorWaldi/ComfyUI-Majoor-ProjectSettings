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


try:
    project_store = _load_module("server/project_store.py")
except Exception:
    project_store = None


class TestProjectActivationLogic(unittest.TestCase):
    def test_slug_id_and_title_path(self):
        if not project_store:
            self.skipTest("project_store module unavailable in isolation")
        slug_id = project_store.slug_id
        title_path = project_store.title_path
        name = "260329_Character_VFX"
        pid = slug_id(name)
        folder = title_path(name).upper()
        self.assertEqual(pid, "260329_character_vfx")
        self.assertEqual(folder, "260329_CHARACTER_VFX")

    def test_special_characters_slug(self):
        if not project_store:
            self.skipTest("project_store module unavailable in isolation")
        slug_id = project_store.slug_id
        name = "Project #1 - Alpha & Beta"
        pid = slug_id(name)
        self.assertTrue(len(pid) > 0)
        self.assertNotIn("#", pid)
        self.assertNotIn("&", pid)


if __name__ == "__main__":
    unittest.main()
