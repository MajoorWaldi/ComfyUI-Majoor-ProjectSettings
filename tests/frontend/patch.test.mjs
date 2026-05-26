import assert from "node:assert/strict";
import test from "node:test";

import {
  PATH_WIDGETS,
  alreadyProjectPathed,
  detectNodeMedia,
  isSaveLikeNode,
  patchSingleNode,
} from "../../js/mjr/patch.js";

test("patchSingleNode patches split path and filename widgets", () => {
  PATH_WIDGETS.splice(0, PATH_WIDGETS.length, "output_path");
  const node = {
    type: "SaveImage",
    widgets: [
      { name: "output_path", value: "" },
      { name: "filename_prefix", value: "" },
    ],
  };

  assert.equal(isSaveLikeNode(node), true);
  assert.equal(patchSingleNode(node, "PROJECTS/Demo/02_OUT/IMAGES", "260526_Test"), true);
  assert.equal(node.widgets[0].value, "PROJECTS/Demo/02_OUT/IMAGES");
  assert.equal(node.widgets[1].value, "260526_Test");
});

test("patchSingleNode falls back to filename_prefix only nodes", () => {
  PATH_WIDGETS.splice(0, PATH_WIDGETS.length, "output_path");
  const node = {
    type: "SaveImage",
    widgets: [{ name: "filename_prefix", value: "" }],
  };

  assert.equal(patchSingleNode(node, "PROJECTS/Demo/02_OUT/IMAGES", "260526_Test"), true);
  assert.equal(node.widgets[0].value, "PROJECTS/Demo/02_OUT/IMAGES/260526_Test");
});

test("detectNodeMedia and alreadyProjectPathed cover common save node hints", () => {
  assert.equal(detectNodeMedia({ type: "VHS_VideoCombine", widgets: [] }), "videos");
  assert.equal(
    detectNodeMedia({ type: "CustomSave", widgets: [{ name: "fps", value: 24 }] }),
    "videos"
  );
  assert.equal(alreadyProjectPathed("PROJECTS/Demo/02_OUT/IMAGES"), true);
  assert.equal(alreadyProjectPathed("plain/output"), false);
});
