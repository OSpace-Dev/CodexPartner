const path = require("node:path");

function createSelectionReference({
  filePath,
  workspaceRoot,
  startLine,
  endLine,
  locale = "en",
}) {
  if (!filePath || !Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;
  if (startLine < 1 || endLine < startLine) return null;

  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, filePath)
    : path.basename(filePath);
  const displayPath = relativePath && !relativePath.startsWith("..")
    ? relativePath
    : path.basename(filePath);
  const normalizedPath = displayPath.split(path.sep).join("/");
  const lineLabel = locale === "zh-cn"
    ? (startLine === endLine ? `第 ${startLine} 行` : `第 ${startLine}-${endLine} 行`)
    : (startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`);

  return locale === "zh-cn"
    ? `请查看文件 \`${normalizedPath}\` 的${lineLabel}。`
    : `Please inspect file \`${normalizedPath}\`, ${lineLabel}.`;
}

function getSelectionLineRange(range) {
  if (!range?.start || !range?.end) return null;
  if (![range.start.line, range.start.character, range.end.line, range.end.character].every(Number.isInteger)) {
    return null;
  }
  if (range.start.line > range.end.line) return null;
  if (range.start.line === range.end.line && range.start.character === range.end.character) return null;

  return {
    startLine: range.start.line + 1,
    endLine: range.end.line
      + (range.end.character === 0 && range.end.line > range.start.line ? 0 : 1),
  };
}

module.exports = { createSelectionReference, getSelectionLineRange };
