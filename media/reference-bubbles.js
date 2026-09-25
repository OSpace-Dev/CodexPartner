(function installReferenceBubbles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.CodexReferenceBubbles = api;
  }
}(typeof globalThis === "object" ? globalThis : this, () => {
  const referencePattern = /【(File|Directory|文件|目录)\s+`([^`]+)`(?:,\s+(line|lines)\s+([^】]+)|，第([^】]+)行)?】/g;

  function getReferenceKind(label) {
    return label === "Directory" || label === "目录" ? "directory" : "file";
  }

  function parseReferenceSegments(value) {
    const text = typeof value === "string" ? value : "";
    const segments = [];
    let cursor = 0;
    let match;

    referencePattern.lastIndex = 0;
    while ((match = referencePattern.exec(text))) {
      if (match.index > cursor) {
        segments.push({ type: "text", value: text.slice(cursor, match.index) });
      }
      const lineLabel = (match[4] || match[5] || "").trim();
      segments.push({
        type: "reference",
        raw: match[0],
        kind: getReferenceKind(match[1]),
        path: match[2],
        lineLabel,
        hasLineRange: Boolean(match[3] === "lines" || /[-–]/u.test(lineLabel)),
      });
      cursor = match.index + match[0].length;
    }
    referencePattern.lastIndex = 0;
    if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
    return segments.length ? segments : [{ type: "text", value: text }];
  }

  function compactPath(path, maxSegments = 3) {
    const parts = String(path).split(/[\\/]/).filter(Boolean);
    if (parts.length <= maxSegments) return parts.join("/");
    return `…/${parts.slice(-maxSegments).join("/")}`;
  }

  function findReferenceTrigger(prefix) {
    const match = /#([^#\r\n]*)$/u.exec(prefix);
    return match ? { offset: match.index, query: match[1] } : null;
  }

  function matchIndices(query, candidate, contiguous = false) {
    const search = query.toLowerCase();
    const text = candidate.toLowerCase();
    if (!search) return [];
    const start = text.indexOf(search);
    if (start >= 0) return Array.from({ length: search.length }, (_, index) => start + index);
    if (contiguous) return null;

    const indices = [];
    let offset = 0;
    for (const character of search) {
      const index = text.indexOf(character, offset);
      if (index < 0) return null;
      for (let unit = 0; unit < character.length; unit += 1) indices.push(index + unit);
      offset = index + character.length;
    }
    return indices;
  }

  function getReferenceSearchHighlights(result, query) {
    const search = String(query || "").replace(/\\/g, "/").trim();
    const label = String(result.label || "");
    const description = String(result.description || "");
    const path = String(result.referencePath || "");
    if (!search) return { label: [], description: [] };

    const pathIndices = () => {
      const indices = matchIndices(search, path);
      if (!description && path === label) return { label: indices || [], description: [] };
      if (!indices || path !== [description, label].filter(Boolean).join("/")) {
        return { label: [], description: matchIndices(search, description) || [] };
      }
      return {
        label: indices.filter((index) => index > description.length).map((index) => index - description.length - 1),
        description: indices.filter((index) => index < description.length),
      };
    };

    if (label.toLowerCase().startsWith(search.toLowerCase())) {
      return { label: matchIndices(search, label), description: [] };
    }
    if (path.toLowerCase().startsWith(search.toLowerCase())) return pathIndices();
    const labelMatch = matchIndices(search, label, true);
    if (labelMatch) return { label: labelMatch, description: [] };
    const descriptionMatch = matchIndices(search, description, true);
    if (descriptionMatch) return { label: [], description: descriptionMatch };
    if (matchIndices(search, path, true)) return pathIndices();
    const fuzzyLabel = matchIndices(search, label);
    if (fuzzyLabel) return { label: fuzzyLabel, description: [] };
    return pathIndices();
  }

  return { compactPath, findReferenceTrigger, getReferenceSearchHighlights, parseReferenceSegments };
}));
