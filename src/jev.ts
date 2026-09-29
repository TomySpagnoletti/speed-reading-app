import { invoke } from "@tauri-apps/api/core";
import type { Cat, Segment } from "./segment.ts";

export const MODEL = "typesafe/jev-1.13";

export interface Verdict {
  cat: Cat;
  conf: number;
}

interface DecisionResponse {
  answers: Partial<Record<string, { choice: Cat; probabilities: Record<Cat, number> }>>;
}

const CRITERIA: Record<Cat, string> = {
  decision:
    "The excerpt asks the user to decide, choose, approve or reject: options or alternatives to pick from, trade-offs, a proposal or recommendation awaiting a yes or no, a risk needing sign-off, 'should I…', 'do you want me to…', 'which do you prefer'. Also an item of a list of options or proposals the user must rule on, and the sentence that announces such a proposal.",
  action:
    "The excerpt asks the user to do something or to answer, without being a choice between options: a task left for the user (relaunch, delete, approve a device, configure, run a command, provide a key, tell the agent when something is done), a question needing an answer, or a problem, blocker or failure the user must handle.",
  info:
    "The excerpt requires nothing from the user right now: it reports what was done, explains how something works, gives status, results, context, file lists, summaries, what the agent will do next on its own, or general advice for later. Section headings and filler also belong here.",
};

const MAX_STATE_CHARS = 60_000;
const MAX_EXCERPT_CHARS = 2_000;
const MAX_QUESTIONS = 25;
const MAX_BATCH_CHARS = 24_000;
const CONCURRENCY = 4;

function numbered(lines: string[]): string {
  const text = lines.map((l, i) => `L${i + 1}: ${l}`).join("\n");
  return text.length > MAX_STATE_CHARS ? `${text.slice(0, MAX_STATE_CHARS)}\n[…truncated]` : text;
}

function chunk(segs: Segment[]): Segment[][] {
  const out: Segment[][] = [];
  let cur: Segment[] = [];
  let size = 0;
  for (const s of segs) {
    if (cur.length && (cur.length >= MAX_QUESTIONS || size + s.text.length > MAX_BATCH_CHARS)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(s);
    size += s.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

function question(s: Segment) {
  const where = s.line === s.lastLine ? `line L${s.line}` : `lines L${s.line}-L${s.lastLine}`;
  const text = s.text.length > MAX_EXCERPT_CHARS ? `${s.text.slice(0, MAX_EXCERPT_CHARS)}…` : s.text;
  return {
    type: "choice",
    instructions: `From the point of view of the developer reading this agent message, classify ONLY the excerpt at ${where} (use the rest of the message just as context). Excerpt:\n"""\n${text}\n"""`,
    criteria: CRITERIA,
  };
}

export function buildState(lines: string[]) {
  return {
    context: "Message written by an AI coding agent (e.g. Claude Code) to the developer who is its user. The developer wants to skim it and spot only what needs their attention.",
    message: numbered(lines),
  };
}

export function buildBody(state: object, batch: Segment[]) {
  return { model: MODEL, state, questions: Object.fromEntries(batch.map((s, i) => [`s${i}`, question(s)])) };
}

export async function classify(lines: string[], segs: Segment[], onResult: (seg: Segment, v: Verdict) => void): Promise<void> {
  const state = buildState(lines);
  const batches = chunk(segs);
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++];
      const res = await invoke<DecisionResponse>("decide", { body: buildBody(state, batch) });
      batch.forEach((s, i) => {
        const answer = res.answers[`s${i}`];
        if (!answer) throw new Error(`Jev returned no answer for lines L${s.line}-L${s.lastLine}`);
        onResult(s, { cat: answer.choice, conf: answer.probabilities[answer.choice] });
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
}
