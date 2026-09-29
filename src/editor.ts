import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension, type Transaction } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const LINE_SEPARATORS = /\u2028|\u2029|\u0085|\v/g;

const highlight = HighlightStyle.define([
  { tag: t.keyword, class: "tok-keyword" },
  { tag: [t.string, t.special(t.string)], class: "tok-string" },
  { tag: [t.number, t.bool, t.null], class: "tok-number" },
  { tag: t.comment, class: "tok-comment" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: "tok-function" },
  { tag: [t.typeName, t.className, t.operator], class: "tok-type" },
  { tag: t.propertyName, class: "tok-property" },
  { tag: t.heading, class: "md-heading" },
  { tag: t.strong, class: "md-strong" },
  { tag: t.emphasis, class: "md-em" },
  { tag: t.strikethrough, class: "md-strike" },
  { tag: t.monospace, class: "md-code" },
  { tag: [t.link, t.url], class: "md-link" },
  { tag: t.quote, class: "md-quote" },
  { tag: [t.processingInstruction, t.labelName, t.contentSeparator], class: "md-punct" },
]);

function selectLine(view: EditorView, pos: number) {
  const { doc } = view.state;
  const line = doc.lineAt(pos);
  view.dispatch({ selection: { anchor: line.from, head: line.number < doc.lines ? doc.line(line.number + 1).from : line.to } });
  view.focus();
}

export function isFullPaste(tr: Transaction): boolean {
  let full = false;
  tr.changes.iterChangedRanges((fromA, toA) => {
    full = fromA === 0 && toA === tr.startState.doc.length;
  });
  return full && tr.isUserEvent("input.paste");
}

export function createEditor(parent: HTMLElement, doc: string, hint: string, extensions: Extension[]): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers({ domEventHandlers: { mousedown: (view, block) => (selectLine(view, block.from), true) } }),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        bracketMatching(),
        EditorView.lineWrapping,
        EditorView.clipboardInputFilter.of((text) => text.replace(LINE_SEPARATORS, "\n")),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(highlight),
        placeholder(hint),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        extensions,
      ],
    }),
  });
}
