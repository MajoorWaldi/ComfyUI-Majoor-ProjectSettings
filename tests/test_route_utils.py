import importlib.util
import os
import unittest
from pathlib import Path
from types import SimpleNamespace


def _load_module(relpath: str):
    root = Path(__file__).resolve().parents[1]
    path = root / relpath
    spec = importlib.util.spec_from_file_location(relpath.replace("/", "_"), path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


route_utils = _load_module("server/route_utils.py")


class EnvGuard:
    def __enter__(self):
        self.original = os.environ.copy()
        return self

    def __exit__(self, exc_type, exc, tb):
        os.environ.clear()
        os.environ.update(self.original)


def request(headers=None, remote="127.0.0.1", cookies=None):
    return SimpleNamespace(headers=headers or {}, remote=remote, cookies=cookies or {})


class TestRouteUtils(unittest.TestCase):
    def setUp(self):
        route_utils._rate_state.clear()

    def test_auth_allows_loopback_without_api_key(self):
        with EnvGuard():
            os.environ.pop("MJR_API_KEY", None)
            self.assertIsNone(route_utils.require_auth(request(remote="127.0.0.1")))

    def test_auth_rejects_remote_without_api_key(self):
        with EnvGuard():
            os.environ.pop("MJR_API_KEY", None)
            resp = route_utils.require_auth(request(remote="203.0.113.10"))
            self.assertEqual(resp.status, 401)

    def test_auth_accepts_matching_api_key(self):
        with EnvGuard():
            os.environ["MJR_API_KEY"] = "secret"
            resp = route_utils.require_auth(
                request(headers={"Authorization": "Bearer secret"}, remote="203.0.113.10")
            )
            self.assertIsNone(resp)

    def test_same_origin_rejects_mismatched_origin(self):
        resp = route_utils.require_same_origin(
            request(headers={"Origin": "http://evil.example", "Host": "127.0.0.1:8188"})
        )
        self.assertEqual(resp.status, 403)

    def test_same_origin_accepts_matching_origin(self):
        resp = route_utils.require_same_origin(
            request(
                headers={
                    "Origin": "http://127.0.0.1:8188",
                    "Host": "127.0.0.1:8188",
                    "X-CSRF-Token": "token",
                },
                cookies={"mjr_csrf": "token"},
            )
        )
        self.assertIsNone(resp)

    def test_same_origin_rejects_missing_csrf(self):
        resp = route_utils.require_same_origin(
            request(headers={"Origin": "http://127.0.0.1:8188", "Host": "127.0.0.1:8188"})
        )
        self.assertEqual(resp.status, 403)

    def test_rate_limit_blocks_after_limit(self):
        with EnvGuard():
            os.environ["MJR_RATE_LIMIT_PER_MIN"] = "2"
            req = request(remote="127.0.0.1")
            self.assertIsNone(route_utils.require_rate_limit(req, "bucket"))
            self.assertIsNone(route_utils.require_rate_limit(req, "bucket"))
            resp = route_utils.require_rate_limit(req, "bucket")
            self.assertEqual(resp.status, 429)


if __name__ == "__main__":
    unittest.main()
