import assert from "node:assert/strict";
import { test } from "node:test";
import { history, redo, undo } from "@codemirror/commands";
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

function run(state: EditorState, command: typeof undo): EditorState {
  let next = state;
  command({ state, dispatch: (tr) => (next = tr.state) });
  return next;
}

const tagged = (state: EditorState) => classified(state).map((s) => [s.tag, state.doc.sliceString(s.from, s.to)]);

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
  const restored = run(prune(state), undo);
  assert.equal(restored.doc.toString(), state.doc.toString());
  assert.deepEqual(classified(restored).map((s) => s.tag), ["info", "action"]);
});

test("editing or deleting text drops the classification it touched", () => {
  const state = classify("Done.\nPlease run it.", "line", byKeyword);
  assert.deepEqual(classified(state.update({ changes: { from: 0, insert: "x" } }).state).map((s) => s.tag), ["action"]);
  assert.deepEqual(classified(state.update({ changes: { from: 0, to: state.doc.length } }).state), []);
});

test("deleting a line keeps the colors of the lines around it", () => {
  const state = classify("Choose A.\nPlease run it.\nChoose B.", "line", byKeyword);
  const line = state.doc.line(2);
  const deleted = state.update({ changes: { from: line.from, to: line.to + 1 }, userEvent: "delete" }).state;
  assert.deepEqual(tagged(deleted), [["decision", "Choose A."], ["decision", "Choose B."]]);
});

test("undo after deleting a line restores its text and color, redo deletes it again", () => {
  const state = classify("Choose A.\nPlease run it.\nChoose B.", "line", byKeyword);
  const line = state.doc.line(2);
  const deleted = state.update({ changes: { from: line.from, to: line.to + 1 }, userEvent: "delete" }).state;
  const restored = run(deleted, undo);
  assert.equal(restored.doc.toString(), state.doc.toString());
  assert.deepEqual(tagged(restored), tagged(state));
  assert.deepEqual(tagged(run(restored, redo)), tagged(deleted));
});

test("undo after typing inside a segment restores its color", () => {
  let state = classify("Please run it.", "line", byKeyword);
  const original = tagged(state);
  for (const [i, ch] of [..."now"].entries()) state = state.update({ changes: { from: 7 + i, insert: ch }, userEvent: "input.type" }).state;
  assert.deepEqual(tagged(state), []);
  assert.deepEqual(tagged(run(state, undo)), original);
});

test("prune reports nothing to remove when there is no info", () => {
  assert.equal(planPrune(classify("Please run it.", "line", byKeyword)).removed, 0);
});
