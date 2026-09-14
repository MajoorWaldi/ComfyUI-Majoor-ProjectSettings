import assert from "node:assert/strict";
import test from "node:test";

import {
  PATH_WIDGETS,
  alreadyProjectPathed,
  detectNodeMedia,
  isSaveLikeNode,
  patchSingleNode,
  previewPatchSingleNode,
  stampGraphProjectSignature,
} from "../../web/js/mjr/patch.js";

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

test("previewPatchSingleNode shows old and new widget values", () => {
  PATH_WIDGETS.splice(0, PATH_WIDGETS.length, "output_path");
  const node = {
    title: "Preview Save",
    type: "SaveImage",
    widgets: [
      { name: "output_path", value: "old/path" },
      { name: "filename_prefix", value: "old_prefix" },
    ],
  };

  const preview = previewPatchSingleNode(node, "PROJECTS/Demo/02_OUT/IMAGES", "260526_Test");
  assert.equal(preview.length, 2);
  assert.equal(preview[0].nodeLabel, "Preview Save");
  assert.equal(preview[0].oldValue, "old/path");
  assert.equal(preview[0].newValue, "PROJECTS/Demo/02_OUT/IMAGES");
  assert.equal(preview[1].oldValue, "old_prefix");
  assert.equal(preview[1].newValue, "260526_Test");
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

test("stampGraphProjectSignature stamps output metadata and project identifiers", () => {
  const fakeApp = { graph: { extra: {} } };
  const fakeState = {
    projectId: "proj_123",
    projectFolder: "MyProject",
    pathTemplate: "{BASE}/{MEDIA}/{DATE}/{NAME}",
    name: "hero_shot",
    kind: "shot",
    media: "videos",
    lastRelDir: "PROJECTS/MyProject/02_OUT/videos/260914/hero_shot",
    lastPrefix: "260914_hero_shot_",
  };

  stampGraphProjectSignature(fakeApp, fakeState);
  assert.equal(fakeApp.graph.extra.mjr_project.project_id, "proj_123");
  assert.equal(fakeApp.graph.extra.mjr_project.project_folder, "MyProject");
  assert.equal(fakeApp.graph.extra.mjr_project.name, "hero_shot");
  assert.equal(fakeApp.graph.extra.mjr_project.kind, "shot");
  assert.equal(fakeApp.graph.extra.mjr_project.media, "videos");
  assert.equal(fakeApp.graph.extra.mjr_project.rel_dir, "PROJECTS/MyProject/02_OUT/videos/260914/hero_shot");
  assert.equal(fakeApp.graph.extra.mjr_project.prefix, "260914_hero_shot_");
});

