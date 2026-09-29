import { invertedEffects } from "@codemirror/commands";
import { StateEffect, StateField, type EditorState, type Line, type Range, type TransactionSpec } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { Cat, Segment } from "./segment.ts";

export type Tag = Cat | "pending";

interface Classified {
  from: number;
  to: number;
  tag: Tag;
  deco: Decoration;
}

export const setSegments = StateEffect.define<DecorationSet>({ map: (v, ch) => v.map(ch) });

function render(state: EditorState, segments: DecorationSet): DecorationSet {
  const out: Range<Decoration>[] = [];
  segments.between(0, state.doc.length, (from, to, d) => {
    const { tag, conf, whole } = d.spec;
    const attributes = { style: `--conf:${conf.toFixed(2)}` };
    if (!whole) {
      out.push(Decoration.mark({ class: `cls-mark cls-${tag}`, attributes }).range(from, to));
      return;
    }
    for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) {
      out.push(Decoration.line({ class: `cls-line cls-${tag}`, attributes }).range(state.doc.line(n).from));
    }
  });
  return Decoration.set(out, true);
}

export const segmentField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSegments)) return e.value;
    if (!tr.docChanged) return value;
    return value.update({ filter: (from, to) => !tr.changes.touchesRange(from, to) }).map(tr.changes);
  },
  provide: (f) => EditorView.decorations.compute([f, "doc"], (state) => render(state, state.field(f))),
});

const undoSegments = invertedEffects.of((tr) => {
  if (!tr.docChanged) return [];
  for (const e of tr.effects) if (e.is(setSegments)) return [setSegments.of(tr.startState.field(segmentField))];
  return [];
});

export const classExtension = [segmentField, undoSegments];

export function segmentRange(seg: Segment, tag: Tag, conf: number): Range<Decoration> {
  return Decoration.mark({ tag, conf, whole: seg.whole }).range(seg.from, seg.to);
}

export function classified(state: EditorState): Classified[] {
  const out: Classified[] = [];
  state.field(segmentField).between(0, state.doc.length, (from, to, deco) => {
    out.push({ from, to, tag: deco.spec.tag, deco });
  });
  return out;
}

function partialDeletions(state: EditorState, line: Line, covered: (pos: number) => boolean) {
  const { doc } = state;
  const runs: { from: number; to: number }[] = [];
  for (let pos = line.from; pos < line.to; pos++) {
    if (!covered(pos)) continue;
    const last = runs[runs.length - 1];
    if (last && !doc.sliceString(last.to, pos).trim()) last.to = pos + 1;
    else runs.push({ from: pos, to: pos + 1 });
  }
  return runs.map((r) => {
    const rest = doc.sliceString(r.to, line.to);
    if (rest.trim()) return { from: r.from, to: r.to + rest.length - rest.trimStart().length };
    return { from: line.from + doc.sliceString(line.from, r.from).trimEnd().length, to: line.to };
  });
}

export function planPrune(state: EditorState): { spec: TransactionSpec; removed: number } {
  const { doc } = state;
  const segments = classified(state);
  const info = segments.filter((s) => s.tag === "info");
  const covered = (pos: number) => info.some((s) => pos >= s.from && pos < s.to);

  const del: boolean[] = [];
  let lastKeptBlank = true;
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const blank = !line.text.trim();
    let allInfo = !blank;
    for (let i = 0; allInfo && i < line.length; i++) allInfo = /\s/.test(line.text[i]) || covered(line.from + i);
    del[n] = allInfo || (blank && lastKeptBlank);
    if (!del[n]) lastKeptBlank = blank;
  }

  const changes: { from: number; to: number }[] = [];
  for (let n = 1; n <= doc.lines; ) {
    if (!del[n]) {
      changes.push(...partialDeletions(state, doc.line(n), covered));
      n++;
      continue;
    }
    const start = n;
    while (n <= doc.lines && del[n]) n++;
    const end = n - 1;
    const from = end === doc.lines && start > 1 ? doc.line(start - 1).to : doc.line(start).from;
    const to = end < doc.lines ? doc.line(end + 1).from : doc.length;
    changes.push({ from, to });
  }

  const cs = state.changes(changes);
  const kept = segments.filter((s) => s.tag !== "info").map((s) => s.deco.range(cs.mapPos(s.from, 1), cs.mapPos(s.to, -1)));
  return { spec: { changes: cs, effects: setSegments.of(Decoration.set(kept, true)), userEvent: "delete.prune" }, removed: info.length };
}

export function gotoNext(view: EditorView): boolean {
  const { state } = view;
  const head = state.selection.main.head;
  const targets = classified(state).filter((s) => s.tag === "decision" || s.tag === "action").map((s) => s.from);
  if (!targets.length) return false;
  const target = targets.find((p) => p > head) ?? targets[0];
  view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "center" }) });
  view.focus();
  return true;
}
