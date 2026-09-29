export type Cat = "decision" | "action" | "info";
export type Mode = "line" | "block" | "sentence";

export const MODES: Mode[] = ["line", "block", "sentence"];

export interface Segment {
  from: number;
  to: number;
  line: number;
  lastLine: number;
  text: string;
  whole: boolean;
  fixed?: Cat;
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^\s{0,3}#{1,6}\s/;
const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const NO_WORDS = /^[\s\p{P}\p{S}]*$/u;
const SENTENCE_END = /[.!?…]+[*_`»”")\]]*(?=\s|$)/g;

export function segment(lines: string[], mode: Mode): Segment[] {
  const starts: number[] = [];
  lines.reduce((pos, l) => (starts.push(pos), pos + l.length + 1), 0);
  const out: Segment[] = [];

  const span = (first: number, last: number, fixed?: Cat) =>
    out.push({ from: starts[first], to: starts[last] + lines[last].length, line: first + 1, lastLine: last + 1, text: lines.slice(first, last + 1).join("\n"), whole: true, fixed });

  const sentences = (i: number) => {
    const line = lines[i];
    const lead = line.search(/\S/);
    const tail = line.trimEnd().length;
    const push = (from: number, to: number) => {
      const text = line.slice(from, to);
      out.push({ from: starts[i] + from, to: starts[i] + to, line: i + 1, lastLine: i + 1, text, whole: from === lead && to === tail, fixed: NO_WORDS.test(text) ? "info" : undefined });
    };
    let begin = lead;
    for (const m of line.matchAll(SENTENCE_END)) {
      const end = m.index + m[0].length;
      push(begin, end);
      begin = end + line.slice(end).search(/\S|$/);
    }
    if (begin < tail) push(begin, tail);
  };

  let block: { first: number; last: number } | null = null;
  const flush = () => {
    if (block) span(block.first, block.last);
    block = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flush();
      const fence = line.trim().slice(0, 3);
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence)) j++;
      const end = Math.min(j, lines.length - 1);
      span(i, end, "info");
      i = end;
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (RULE.test(line) || NO_WORDS.test(line)) {
      flush();
      span(i, i, "info");
      continue;
    }

    if (mode === "line" || HEADING.test(line)) {
      flush();
      span(i, i);
      continue;
    }

    if (mode === "sentence") {
      sentences(i);
      continue;
    }

    if (LIST_ITEM.test(line)) flush();
    if (block) block.last = i;
    else block = { first: i, last: i };
  }
  flush();
  return out;
}
