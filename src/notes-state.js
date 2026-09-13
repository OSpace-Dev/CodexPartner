const notesLimit = 200;

function normalizeNotes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note) => note && typeof note.id === "string" && typeof note.content === "string")
    .map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: Number.isFinite(note.createdAt) ? note.createdAt : 0,
    }))
    .slice(0, notesLimit);
}

function addNote(notes, content, now = Date.now(), id = `${now}-${Math.random().toString(36).slice(2, 8)}`) {
  if (typeof content !== "string" || !content.trim()) return normalizeNotes(notes);
  return [{ id, content: content.trim(), createdAt: now }, ...normalizeNotes(notes)].slice(0, notesLimit);
}

function removeNote(notes, id) {
  if (typeof id !== "string") return normalizeNotes(notes);
  return normalizeNotes(notes).filter((note) => note.id !== id);
}

module.exports = { addNote, normalizeNotes, removeNote, notesLimit };
