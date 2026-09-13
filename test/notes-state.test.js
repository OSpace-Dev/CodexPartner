const test = require("node:test");
const assert = require("node:assert/strict");
const { addNote, normalizeNotes, removeNote } = require("../src/notes-state");

test("notes state adds newest non-empty content first", () => {
  const notes = addNote([], "  inspect the selected file  ", 100, "note-1");
  assert.deepEqual(notes, [{ id: "note-1", content: "inspect the selected file", createdAt: 100 }]);
  assert.deepEqual(addNote(notes, "\n\t", 101, "note-2"), notes);
});

test("notes state normalizes malformed persisted values", () => {
  assert.deepEqual(normalizeNotes([null, { id: "a", content: "ok" }, { id: 1, content: "bad" }]), [
    { id: "a", content: "ok", createdAt: 0 },
  ]);
});

test("notes state removes one note without mutating the input", () => {
  const notes = addNote([], "one", 1, "a");
  const next = removeNote(notes, "a");
  assert.deepEqual(next, []);
  assert.equal(notes.length, 1);
});
