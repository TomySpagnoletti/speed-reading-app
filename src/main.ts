import "@fontsource-variable/lilex/wght.css";
import "@fontsource-variable/lilex/wght-italic.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import { invoke } from "@tauri-apps/api/core";
import type { Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { classExtension, classified, gotoNext, planPrune, segmentRange, setSegments } from "./classes.ts";
import { createEditor, isFullPaste } from "./editor.ts";
import { classify, MODEL } from "./jev.ts";
import { MODES, segment, type Mode } from "./segment.ts";

const $ = (id: string) => document.getElementById(id)!;
const modeButtons = document.querySelectorAll<HTMLButtonElement>("#mode button");

let mode = (localStorage.getItem("mode") ?? "block") as Mode;
let running = false;
let resetArmed: number | undefined;

window.addEventListener("unhandledrejection", (e) => status(`Error: ${e.reason}`, ""));

const view = createEditor($("editor"), "", "Paste the output of Claude or any other coding agent here…", [
  classExtension,
  EditorView.updateListener.of((u) => {
    if (u.docChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(setSegments)))) refreshCounts();
    if (u.transactions.some(isFullPaste)) analyze();
  }),
]);

const notes = createEditor($("notes"), await invoke<string>("load_notes"), "Notes. Nothing typed here is sent to Jev.", [
  EditorView.updateListener.of((u) => {
    if (u.docChanged) invoke("save_notes", { text: u.state.doc.toString() });
  }),
]);

function renderNotes(open: boolean) {
  $("notes").hidden = !open;
  $("toggle-notes").classList.toggle("on", open);
  localStorage.setItem("notes", open ? "open" : "closed");
}

function toggleNotes() {
  const open = $("notes").hasAttribute("hidden");
  renderNotes(open);
  (open ? notes : view).focus();
}

function status(text: string, meta: string) {
  $("status-text").textContent = text;
  $("status-meta").textContent = meta;
}

function formatCost(cost: number): string {
  const micros = Math.ceil(Number((cost * 1e6).toFixed(3)));
  return (micros / 1e6).toFixed(6);
}

async function refreshLedger() {
  const { calls, cost } = await invoke<{ calls: number; cost: number }>("ledger_totals");
  $("ledger").textContent = `${calls} call(s) · $${formatCost(cost)} total`;
}

async function resetLedger() {
  const button = $("reset-ledger");
  if (resetArmed === undefined) {
    button.textContent = "Confirm";
    button.classList.add("armed");
    resetArmed = window.setTimeout(disarmReset, 3000);
    return;
  }
  window.clearTimeout(resetArmed);
  disarmReset();
  await invoke("reset_ledger");
  await refreshLedger();
}

function disarmReset() {
  resetArmed = undefined;
  $("reset-ledger").textContent = "Reset";
  $("reset-ledger").classList.remove("armed");
}

function refreshCounts() {
  const counts = { decision: 0, action: 0, info: 0, pending: 0 };
  for (const s of classified(view.state)) counts[s.tag]++;
  $("c-decision").textContent = String(counts.decision);
  $("c-action").textContent = String(counts.action);
  $("c-info").textContent = String(counts.info);
}

function renderMode() {
  modeButtons.forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
}

function setMode(m: Mode) {
  mode = m;
  localStorage.setItem("mode", m);
  renderMode();
  if (classified(view.state).length) analyze();
}

function prune() {
  const { spec, removed } = planPrune(view.state);
  if (!removed) return status("Nothing to delete: run an analysis first.", "");
  view.dispatch(spec);
  status(`Deleted ${removed} info segment(s). ⌘Z to undo.`, "");
}

function next() {
  if (!gotoNext(view)) status("Nothing needs your attention.", "");
}

async function analyze() {
  if (running) return;
  const state = view.state;
  const lines = state.doc.toString().split("\n");
  const segs = segment(lines, mode);
  if (!segs.length) return status("Nothing to analyze.", "");

  running = true;
  const runMode = mode;
  $("analyze").classList.add("busy");
  const startDoc = state.doc;
  const toSend = segs.filter((s) => !s.fixed);
  const t0 = performance.now();
  status(`Analyzing ${toSend.length} ${mode} segment(s)…`, MODEL);

  const results = new Map<number, Range<Decoration>>();
  for (const s of segs) results.set(s.from, segmentRange(s, s.fixed ?? "pending", 1));
  const paint = () => {
    if (view.state.doc === startDoc) view.dispatch({ effects: setSegments.of(Decoration.set([...results.values()], true)) });
  };
  paint();

  try {
    await classify(lines, toSend, (s, v) => {
      results.set(s.from, segmentRange(s, v.cat, v.conf));
      paint();
    });
    const edited = view.state.doc !== startDoc;
    status(
      edited ? "Text changed during the analysis: press ⌘↵ to run it again." : "Done. ⌘J jumps to the next item, ⌘⇧⌫ deletes the info segments.",
      `${MODEL} · ${Math.round(performance.now() - t0)} ms`,
    );
  } catch (e) {
    for (const [k, r] of results) if (r.value.spec.tag === "pending") results.delete(k);
    paint();
    status(`Error: ${e}`, MODEL);
  } finally {
    running = false;
    $("analyze").classList.remove("busy");
    await refreshLedger();
    if (mode !== runMode) analyze();
  }
}

const shortcuts: Record<string, () => unknown> = {
  enter: analyze,
  "shift-backspace": prune,
  j: next,
  l: () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]),
};

window.addEventListener(
  "keydown",
  (e) => {
    const run = e.metaKey && shortcuts[`${e.shiftKey ? "shift-" : ""}${e.key.toLowerCase()}`];
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  },
  { capture: true },
);

modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));
$("analyze").addEventListener("click", analyze);
$("prune").addEventListener("click", prune);
$("next").addEventListener("click", next);
$("reset-ledger").addEventListener("click", resetLedger);
$("toggle-notes").addEventListener("click", toggleNotes);
renderNotes(localStorage.getItem("notes") === "open");
renderMode();
status("Paste an agent output: the analysis starts on its own.", MODEL);
refreshLedger();
view.focus();
