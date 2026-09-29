import assert from "node:assert/strict";
import { test } from "node:test";
import { segment, type Mode } from "./segment.ts";

const doc = [
  "## Title",
  "",
  "**Relay : one only.** Your iPhone is a *client*. Relaunch it from the UI.",
  "- Option A : Redis. Faster",
  "- Option B",
  "  continued",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "---",
  "Node v24.21.0 and TODO.md stay whole",
].join("\n");
const lines = doc.split("\n");

const view = (mode: Mode) => segment(lines, mode).map((s) => ({ line: s.line, lastLine: s.lastLine, text: s.text, whole: s.whole, fixed: s.fixed }));

test("segments always match the document text at their offsets", () => {
  for (const mode of ["line", "block", "sentence"] as const) {
    for (const s of segment(lines, mode)) assert.equal(doc.slice(s.from, s.to), s.text);
  }
});

test("line mode gives one segment per non-blank line and one per code fence", () => {
  assert.deepEqual(
    view("line").map((s) => [s.line, s.lastLine, s.fixed]),
    [[1, 1, undefined], [3, 3, undefined], [4, 4, undefined], [5, 5, undefined], [6, 6, undefined], [8, 10, "info"], [11, 11, "info"], [12, 12, undefined]],
  );
});

test("block mode groups continuation lines and splits list items", () => {
  assert.deepEqual(
    view("block").map((s) => [s.line, s.lastLine]),
    [[1, 1], [3, 3], [4, 4], [5, 6], [8, 10], [11, 11], [12, 12]],
  );
});

test("sentence mode splits on sentence punctuation only", () => {
  assert.deepEqual(
    view("sentence").filter((s) => s.line === 3 || s.line === 4 || s.line === 12).map((s) => s.text),
    ["**Relay : one only.**", "Your iPhone is a *client*.", "Relaunch it from the UI.", "- Option A : Redis.", "Faster", "Node v24.21.0 and TODO.md stay whole"],
  );
});

test("a sentence filling its line is whole, a partial one is not", () => {
  const sentences = view("sentence");
  assert.equal(sentences.find((s) => s.text === "Node v24.21.0 and TODO.md stay whole")?.whole, true);
  assert.equal(sentences.find((s) => s.text === "Faster")?.whole, false);
});
