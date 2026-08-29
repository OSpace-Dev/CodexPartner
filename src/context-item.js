const path = require("node:path");

const MAX_PREVIEW_LENGTH = 160;

function createFileRangeContext({ filePath, workspaceRoot, startLine, endLine, preview }) {
  if (!filePath || !Number.isInteger(startLine) || !Number.isInteger(endLine)) return null;
  if (startLine < 1 || endLine < startLine) return null;

  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, filePath)
    : path.basename(filePath);
  const displayPath = relativePath && !relativePath.startsWith("..")
    ? relativePath
    : path.basename(filePath);
  const normalizedPath = displayPath.split(path.sep).join("/");
  if (!normalizedPath || normalizedPath === ".") return null;

  return {
    id: createContextId(),
    type: "fileRange",
    path: normalizedPath,
    startLine,
    endLine,
    preview: normalizePreview(preview),
  };
}

function normalizeContextItem(item) {
  if (!item || item.type !== "fileRange") return null;
  if (typeof item.path !== "string" || !item.path || path.isAbsolute(item.path)) return null;
  if (item.path.split(/[\\/]/).some((segment) => segment === "..")) return null;
  if (!Number.isInteger(item.startLine) || !Number.isInteger(item.endLine)) return null;
  if (item.startLine < 1 || item.endLine < item.startLine) return null;

  return {
    id: typeof item.id === "string" && item.id ? item.id : createContextId(),
    type: "fileRange",
    path: item.path.split("\\").join("/"),
    startLine: item.startLine,
    endLine: item.endLine,
    preview: normalizePreview(item.preview),
  };
}

function normalizeContextItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeContextItem).filter(Boolean);
}

function normalizeComposerBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;

  const normalized = [];
  for (const block of blocks) {
    if (block?.type === "text") {
      if (typeof block.value !== "string") return null;
      if (block.value) appendTextBlock(normalized, block.value);
      continue;
    }
    if (block?.type === "context") {
      const item = normalizeContextItem(block.item);
      if (!item) return null;
      normalized.push({ type: "context", item });
      continue;
    }
    return null;
  }
  return normalized;
}

function serializeComposerBlocks(blocks) {
  const normalized = normalizeComposerBlocks(blocks);
  if (!normalized) return "";
  return normalized.map((block) => {
    if (block.type === "text") return block.value;
    return formatInlineContext(block.item);
  }).join("");
}

function formatContextLocation(item) {
  const lineLabel = item.startLine === item.endLine
    ? `第 ${item.startLine} 行`
    : `第 ${item.startLine}-${item.endLine} 行`;
  return `文件 \`${item.path}\`，${lineLabel}`;
}

function formatInlineContext(item) {
  const lineLabel = item.startLine === item.endLine
    ? String(item.startLine)
    : `${item.startLine}-${item.endLine}`;
  return `【文件 \`${item.path}\`，第 ${lineLabel} 行】`;
}

function formatContextLabel(item) {
  return `${item.path}:${item.startLine === item.endLine ? item.startLine : `${item.startLine}-${item.endLine}`}`;
}

function serializeComposerMessage(text, items) {
  const message = String(text ?? "").trim();
  const contexts = normalizeContextItems(items);
  if (contexts.length === 0) return message;

  const lines = ["请参考以下项目上下文："];
  for (const item of contexts) {
    const preview = item.preview ? `：${item.preview}` : "";
    lines.push(`- ${formatContextLocation(item)}${preview}`);
  }
  if (message) lines.push("", "用户指令：", message);
  return lines.join("\n");
}

function normalizePreview(value) {
  if (typeof value !== "string") return "";
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > MAX_PREVIEW_LENGTH
    ? `${compact.slice(0, MAX_PREVIEW_LENGTH - 1)}…`
    : compact;
}

function appendTextBlock(blocks, value) {
  const previous = blocks.at(-1);
  if (previous?.type === "text") {
    previous.value += value;
    return;
  }
  blocks.push({ type: "text", value });
}

function createContextId() {
  return `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  createFileRangeContext,
  formatContextLabel,
  formatInlineContext,
  normalizeComposerBlocks,
  normalizeContextItem,
  normalizeContextItems,
  serializeComposerBlocks,
  serializeComposerMessage,
};
