const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseReferenceSegments,
  compactPath,
  findReferenceTrigger,
  getReferenceSearchHighlights,
} = require("../media/reference-bubbles");

test("parses an English file reference and preserves its exact raw text", () => {
  const raw = "【File `src/one/two/three/four.js`, lines 2-4】";
  const [segment] = parseReferenceSegments(raw);

  assert.equal(segment.type, "reference");
  assert.equal(segment.kind, "file");
  assert.equal(segment.path, "src/one/two/three/four.js");
  assert.equal(segment.lineLabel, "2-4");
  assert.equal(segment.hasLineRange, true);
  assert.equal(segment.raw, raw);
});

test("parses a Chinese directory reference", () => {
  const raw = "【目录 `src/components/shared`】";
  const [segment] = parseReferenceSegments(raw);

  assert.deepEqual(segment, {
    type: "reference",
    raw,
    kind: "directory",
    path: "src/components/shared",
    lineLabel: "",
    hasLineRange: false,
  });
});

test("trims localized line labels without changing the raw reference", () => {
  const raw = "【文件 `src/index.js`，第 8 行】";
  const [segment] = parseReferenceSegments(raw);

  assert.equal(segment.lineLabel, "8");
  assert.equal(segment.hasLineRange, false);
  assert.equal(segment.raw, raw);
});

test("keeps plain text around multiple references", () => {
  const value = "See 【File `src/a.js`, line 8】 and 【目录 `src/components`】.";
  const segments = parseReferenceSegments(value);

  assert.deepEqual(segments.map((segment) => segment.type), [
    "text",
    "reference",
    "text",
    "reference",
    "text",
  ]);
  assert.equal(segments[0].value, "See ");
  assert.equal(segments[2].value, " and ");
  assert.equal(segments[4].value, ".");
  assert.equal(segments[1].hasLineRange, false);
});

test("compacts long paths to a readable suffix", () => {
  assert.equal(
    compactPath("src/one/two/three/four.js"),
    "…/two/three/four.js",
  );
  assert.equal(compactPath("src\\one\\two\\three\\four.js"), "…/two/three/four.js");
  assert.equal(compactPath("README.md"), "README.md");
});

test("a hash triggers reference search without a preceding space", () => {
  assert.deepEqual(findReferenceTrigger("word#button"), { offset: 4, query: "button" });
  assert.deepEqual(findReferenceTrigger("引用#目录"), { offset: 2, query: "目录" });
  assert.deepEqual(findReferenceTrigger("#"), { offset: 0, query: "" });
  assert.deepEqual(findReferenceTrigger("first#old#new"), { offset: 9, query: "new" });
  assert.equal(findReferenceTrigger("word#query\nnext"), null);
});

test("highlights contiguous and fuzzy matches in names and parent paths", () => {
  const entry = {
    label: "button.js",
    description: "src/components",
    referencePath: "src/components/button.js",
  };
  assert.deepEqual(getReferenceSearchHighlights(entry, "btn"), {
    label: [0, 2, 5],
    description: [],
  });
  assert.deepEqual(getReferenceSearchHighlights(entry, "components"), {
    label: [],
    description: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  });
  assert.deepEqual(getReferenceSearchHighlights(entry, "scbj"), {
    label: [0, 7],
    description: [0, 2],
  });
  assert.deepEqual(getReferenceSearchHighlights({
    label: "README.md",
    description: "",
    referencePath: "README.md",
  }, "read"), {
    label: [0, 1, 2, 3],
    description: [],
  });
});
