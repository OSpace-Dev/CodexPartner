const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  notesViewContainerId,
  notesViewId,
} = require("../src/prompt-notes-view");

const manifestPath = path.join(__dirname, "..", "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("prompt notes uses a dedicated Activity Bar container", () => {
  const activityBarContainers = manifest.contributes.viewsContainers?.activitybar ?? [];
  const container = activityBarContainers.find(({ id }) => id === notesViewContainerId);

  assert.deepEqual(container, {
    id: notesViewContainerId,
    title: "%codexPartner.displayName%",
    icon: "media/activitybar.svg",
  });
  assert.equal(manifest.contributes.views.explorer, undefined);
  assert.equal(manifest.contributes.views[notesViewContainerId]?.[0]?.id, notesViewId);
  assert.equal(manifest.contributes.views[notesViewContainerId]?.[0]?.type, "webview");
});

test("Activity Bar icon is included in the extension package", () => {
  assert.equal(fs.existsSync(path.join(__dirname, "..", "media", "activitybar.svg")), true);
});
