import importlib.util
import sys
import types
import unittest
from pathlib import Path


def _load_downloader_module():
    root = Path(__file__).resolve().parents[1]
    server_dir = root / "server"

    pkg_name = "mjr_server_testpkg"
    pkg = types.ModuleType(pkg_name)
    pkg.__path__ = [str(server_dir)]
    sys.modules[pkg_name] = pkg

    class _Routes:
        def post(self, _path):
            return lambda fn: fn

        def get(self, _path):
            return lambda fn: fn

    prompt_server = types.SimpleNamespace(instance=types.SimpleNamespace(routes=_Routes()))
    sys.modules["server"] = types.SimpleNamespace(PromptServer=prompt_server)
    sys.modules["folder_paths"] = types.SimpleNamespace(
        models_dir=str(root / "models"),
        get_folder_paths=lambda _kind: [],
        get_base_path=lambda: str(root),
        get_user_directory=lambda: str(root),
    )

    name = f"{pkg_name}.model_downloader_routes"
    path = server_dir / "model_downloader_routes.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


downloader = _load_downloader_module()


class TestModelDownloaderRoutes(unittest.TestCase):
    def setUp(self):
        downloader._load_settings = lambda: {}

    def test_validate_url_allows_public_hosts_by_default(self):
        ok, err = downloader._validate_url("https://example.com/models/test.safetensors")
        self.assertTrue(ok, err)

    def test_validate_url_can_still_use_restrictive_allowlist(self):
        downloader._load_settings = lambda: {"mjr_project.download_allow_any_host": False}
        ok, err = downloader._validate_url("https://example.com/models/test.safetensors")
        self.assertFalse(ok)
        self.assertEqual(err, "host is not allowed")

    def test_validate_url_still_rejects_local_hosts(self):
        ok, err = downloader._validate_url("http://localhost/models/test.safetensors")
        self.assertFalse(ok)
        self.assertIn("local", err)


if __name__ == "__main__":
    unittest.main()
