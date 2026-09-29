# SpeedRead v0.1

Paste the output of a coding agent (Claude, etc.). Jev, TypeSafe's decision model served through OpenRouter, classifies each line, Markdown block or sentence:

- **Decision** (orange): a choice or an approval is waiting for you.
- **Action** (blue): something to do, a question to answer or a problem to handle.
- **Info** (dimmed): plain report, deletable in one go.

In Line and Block modes whole lines are highlighted. In Sentence mode only the sentence is highlighted, unless it fills its line.

## Shortcuts

| Shortcut | Action |
|---|---|
| ⌘↵ | Analyze (runs on its own when pasting into an empty editor) |
| ⌘L | Cycle through Line, Block and Sentence modes (runs the analysis again) |
| ⌘J | Jump to the next item that needs attention |
| ⌘⇧⌫ | Delete every info segment |
| ⌘Z | Undo, colors included |
| Click a line number | Select the whole line |

## OpenRouter key

The key is read from `OPENROUTER_API_KEY` in the `.env` file at the project root, on every request. It never reaches the web view. `.env` is git-ignored.

## Notes

The Notes button opens a panel on the right, 40% of the window wide. It is the same editor, with line numbers and Markdown highlighting, but nothing typed there is sent to Jev. Notes are saved on every change to `~/.speedread/notes.md`.

## Call ledger

Every Jev call is appended to `~/.speedread/ledger.jsonl`, one JSON line per call with its time, id, model, input tokens and cost. The status bar shows the total number of calls and their cost since the last reset. The small Reset button next to it asks for a second click on Confirm, then deletes the ledger.

## Development

```bash
npm install
npm run tauri dev
```

Build the app with `npm run tauri build -- --bundles app`. The bundle lands in `src-tauri/target/release/bundle/macos/SpeedRead.app`.

## Structure

- `src-tauri/src/lib.rs`: Rust proxy to the OpenRouter Decisions API, key loading, call ledger and notes storage.
- `src/segment.ts`: splitting into lines, Markdown blocks or sentences.
- `src/jev.ts`: Jev model, category criteria, parallel batches.
- `src/classes.ts`: coloring, info deletion, navigation.
- `src/editor.ts`: editor setup shared by the analysis editor and the notes panel, including Markdown highlighting.
- `src/main.ts`: analysis flow, toolbar, notes panel and shortcuts.
