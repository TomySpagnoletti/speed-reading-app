import assert from "node:assert/strict";
import { test } from "node:test";
import { history, undo } from "@codemirror/commands";
import { Decoration } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { classExtension, classified, planPrune, segmentRange, setSegments } from "./classes.ts";
import { segment, type Cat, type Mode } from "./segment.ts";

function classify(doc: string, mode: Mode, pick: (text: string) => Cat) {
  const state = EditorState.create({ doc, extensions: [history(), classExtension] });
  const ranges = segment(doc.split("\n"), mode).map((s) => segmentRange(s, s.fixed ?? pick(s.text), 1));
  return state.update({ effects: setSegments.of(Decoration.set(ranges, true)) }).state;
}

const byKeyword = (text: string): Cat => (/choose/i.test(text) ? "decision" : /please/i.test(text) ? "action" : "info");

function prune(state: EditorState) {
  return state.update(planPrune(state).spec).state;
}

test("line mode prune removes info lines and collapses the blank lines they leave", () => {
  const state = classify("Done A.\n\nPlease run it.\n\nDone B.\n\nChoose X or Y.\nDone C.", "line", byKeyword);
  assert.equal(prune(state).doc.toString(), "Please run it.\n\nChoose X or Y.");
});

test("sentence mode prune removes info sentences inside kept lines", () => {
  const state = classify("Done first. Please run it. Done after.\nDone only.\nChoose X. Done tail.", "sentence", byKeyword);
  assert.equal(prune(state).doc.toString(), "Please run it.\nChoose X.");
});

test("prune keeps the colors of the remaining segments at their new positions", () => {
  const pruned = prune(classify("Done first. Please run it.\nDone.\nChoose X.", "sentence", byKeyword));
  const doc = pruned.doc.toString();
  assert.deepEqual(classified(pruned).map((s) => [s.tag, doc.slice(s.from, s.to)]), [["action", "Please run it."], ["decision", "Choose X."]]);
});

test("undo after prune restores both the text and the colors", () => {
  const state = classify("Done.\nPlease run it.", "line", byKeyword);
  let restored = prune(state);
  undo({ state: restored, dispatch: (tr) => (restored = tr.state) });
  assert.equal(restored.doc.toString(), state.doc.toString());
  assert.deepEqual(classified(restored).map((s) => s.tag), ["info", "action"]);
});

test("editing or deleting text drops the classification it touched", () => {
  const state = classify("Done.\nPlease run it.", "line", byKeyword);
  assert.deepEqual(classified(state.update({ changes: { from: 0, insert: "x" } }).state).map((s) => s.tag), ["action"]);
  assert.deepEqual(classified(state.update({ changes: { from: 0, to: state.doc.length } }).state), []);
});

test("prune reports nothing to remove when there is no info", () => {
  assert.equal(planPrune(classify("Please run it.", "line", byKeyword)).removed, 0);
});
