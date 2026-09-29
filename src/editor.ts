import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const LINE_SEPARATORS = /\u2028|\u2029|\u0085|\v/g;

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "#b477cf" },
  { tag: [t.string, t.special(t.string)], color: "#a1c181" },
  { tag: [t.number, t.bool, t.null], color: "#bf956a" },
  { tag: t.comment, color: "#5d636f", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#73ade9" },
  { tag: [t.typeName, t.className], color: "#6eb4bf" },
  { tag: t.propertyName, color: "#d07277" },
  { tag: t.operator, color: "#6eb4bf" },
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
