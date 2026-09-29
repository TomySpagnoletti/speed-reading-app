import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";
import { isFullPaste } from "./editor.ts";

const paste = (doc: string, from: number, to: number) => EditorState.create({ doc }).update({ changes: { from, to, insert: "new text" }, userEvent: "input.paste" });

test("pasting into an empty editor is a full paste", () => {
  assert.equal(isFullPaste(paste("", 0, 0)), true);
});

test("pasting over the whole existing text is a full paste", () => {
  assert.equal(isFullPaste(paste("old agent output", 0, 16)), true);
});

test("pasting into part of the text is not a full paste", () => {
  assert.equal(isFullPaste(paste("old agent output", 4, 9)), false);
  assert.equal(isFullPaste(paste("old agent output", 16, 16)), false);
});

test("replacing the whole text without pasting is not a full paste", () => {
  const typed = EditorState.create({ doc: "old" }).update({ changes: { from: 0, to: 3, insert: "x" }, userEvent: "input.type" });
  assert.equal(isFullPaste(typed), false);
});
