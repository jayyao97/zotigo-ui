import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { StateEffect, EditorState } from "@codemirror/state";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--text)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, monospace',
    lineHeight: "1.6",
  },
  ".cm-content": { caretColor: "var(--text)", padding: "14px 0 40px" },
  ".cm-gutters": {
    backgroundColor: "var(--app-bg)",
    color: "var(--text-dim)",
    border: "0",
    paddingLeft: "8px",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "rgb(255 255 255 / 0.035)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgb(51 156 255 / 0.22) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
}, { dark: true });

export function CodeEditor({
  value,
  filePath,
  line,
  column,
  readOnly,
  onChange,
  onSave,
}: {
  value: string;
  filePath: string;
  line?: number;
  column?: number;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      doc: value,
      extensions: [
        basicSetup,
        editorTheme,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          keydown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              onSaveRef.current();
              return true;
            }
            return false;
          },
        }),
      ],
    });
    editorRef.current = view;
    let active = true;
    void languageForFile(filePath).then((support) => {
      if (active && support) view.dispatch({ effects: StateEffect.appendConfig.of(support) });
    });
    return () => {
      active = false;
      editorRef.current = null;
      view.destroy();
    };
  }, [filePath, readOnly]);

  useEffect(() => {
    const view = editorRef.current;
    if (!view || !line) return;
    const targetLine = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
    const offset = Math.min(Math.max(0, (column ?? 1) - 1), targetLine.length);
    const position = targetLine.from + offset;
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: "center" }),
    });
    view.focus();
  }, [line, column]);

  return <div ref={parentRef} className="code-editor" />;
}

async function languageForFile(filePath: string) {
  const fileName = filePath.split(/[\\/]/).at(-1) ?? filePath;
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
  if (["md", "markdown", "mdown", "mkd"].includes(extension ?? "")) {
    return (await import("@codemirror/lang-markdown")).markdown();
  }
  if (extension === "go") return (await import("@codemirror/lang-go")).go();
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"].includes(extension ?? "")) {
    return (await import("@codemirror/lang-javascript")).javascript({
      jsx: ["jsx", "tsx"].includes(extension ?? ""),
      typescript: ["ts", "tsx", "mts", "cts"].includes(extension ?? ""),
    });
  }
  if (["json", "jsonc", "jsonl"].includes(extension ?? "")) return (await import("@codemirror/lang-json")).json();
  if (["css", "scss", "less"].includes(extension ?? "")) return (await import("@codemirror/lang-css")).css();
  if (["html", "htm", "xhtml", "vue"].includes(extension ?? "")) return (await import("@codemirror/lang-html")).html();
  if (["py", "pyi", "pyw"].includes(extension ?? "")) return (await import("@codemirror/lang-python")).python();
  return null;
}
