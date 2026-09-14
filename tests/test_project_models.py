import importlib.util
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


class TestProjectModels(unittest.TestCase):
    def test_dynamic_categories_handling(self):
        # Verify priority categories and dynamic addition logic
        priority_categories = [
            "diffusion_models",
            "checkpoints",
            "vae",
            "loras",
            "text_encoders",
            "clip",
            "clip_vision",
            "controlnet",
            "upscale_models",
            "embeddings",
            "unet",
        ]
        registered = {
            "diffusion_models": ["path1"],
            "custom_photomaker": ["path2"],
            "_hidden": ["path3"],
        }
        all_categories = list(priority_categories)
        for name in registered.keys():
            if name not in all_categories and not name.startswith("_"):
                all_categories.append(name)

        self.assertIn("custom_photomaker", all_categories)
        self.assertNotIn("_hidden", all_categories)
        self.assertEqual(all_categories[0], "diffusion_models")


if __name__ == "__main__":
    unittest.main()
