const test = require("node:test");
const assert = require("node:assert/strict");
const { getReferenceLocale, isChineseLocale } = require("../src/localization");

test("recognizes Chinese VS Code locales", () => {
  assert.equal(isChineseLocale("zh-cn"), true);
  assert.equal(isChineseLocale("zh-TW"), true);
  assert.equal(isChineseLocale("en-US"), false);
  assert.equal(getReferenceLocale("zh-cn"), "zh-cn");
  assert.equal(getReferenceLocale("en-US"), "en");
  assert.equal(getReferenceLocale(undefined), "en");
});