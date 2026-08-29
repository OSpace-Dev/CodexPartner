const nodePath = require("node:path");

function formatFileRangeReference({ path: filePath, startLine, endLine }) {
  if (!isValidRelativePath(filePath) || !isValidLineRange(startLine, endLine)) return null;
  const lineLabel = startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
  return `【文件 \`${normalizePath(filePath)}\`，第 ${lineLabel} 行】`;
}

function formatFileReference(filePath) {
  if (!isValidRelativePath(filePath)) return null;
  return `【文件 \`${normalizePath(filePath)}\`】`;
}

function formatDirectoryReference(directoryPath) {
  if (!isValidRelativePath(directoryPath)) return null;
  return `【目录 \`${normalizePath(directoryPath)}\`】`;
}

function isValidRelativePath(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = normalizePath(value);
  return !nodePath.posix.isAbsolute(normalized)
    && !nodePath.win32.isAbsolute(normalized)
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split("/").some((segment) => segment === "..")
    && normalized !== ".";
}

function isValidLineRange(startLine, endLine) {
  return Number.isInteger(startLine)
    && Number.isInteger(endLine)
    && startLine >= 1
    && endLine >= startLine;
}

function normalizePath(value) {
  return value.split("\\").join("/");
}

module.exports = {
  formatDirectoryReference,
  formatFileRangeReference,
  formatFileReference,
  isValidLineRange,
  isValidRelativePath,
};