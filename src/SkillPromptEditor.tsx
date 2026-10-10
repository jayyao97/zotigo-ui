import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { minimalSetup } from "codemirror";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, ViewPlugin, type ViewUpdate, placeholder } from "@codemirror/view";
import { editorSkillTokens } from "../shared/skillCommands";

const externalChange = Annotation.define<boolean>();

export type SkillPromptEditorHandle = { focus: (options?: FocusOptions) => void };
class SkillWidget extends WidgetType {
  constructor(readonly name: string) { super(); }
  eq(other: SkillWidget) { return this.name === other.name; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "inline-skill-token";
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✧ ";
    const label = document.createElement("span");
    label.className = "inline-skill-name";
    label.textContent = this.name;
    span.append(icon, label);
    span.setAttribute("aria-label", `Skill: ${this.name}`);
    return span;
  }
}
function skillDecorations(names: string[]) {
  const decorate = (view: EditorView) => Decoration.set(editorSkillTokens(view.state.doc.toString(), names).map(token =>
    Decoration.replace({ widget: new SkillWidget(token.name) }).range(token.from, token.to)));
  const plugin = ViewPlugin.fromClass(class {
    decorations;
    constructor(view: EditorView) { this.decorations = decorate(view); }
    update(update: ViewUpdate) { if (update.docChanged) this.decorations = decorate(update.view); }
  }, { decorations: instance => instance.decorations });
  return [plugin, EditorView.atomicRanges.of(view => view.plugin(plugin)?.decorations ?? Decoration.none)];
}
export function SkillPromptEditor(props: {
  ref?: Ref<SkillPromptEditorHandle>;
  value: string;
  skills: string[];
  placeholder: string;
  autoFocus?: boolean;
  onChange: (value: string, caret?: number, skills?: string[]) => void;
  onCaretChange: (caret: number) => void;
  onHeightChange?: () => void;
  onKeyDown: (event: globalThis.KeyboardEvent) => void;
  onPaste: (event: globalThis.ClipboardEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const focusRequested = useRef(false);
  const current = useRef(props); current.current = props;
  const knownSkills = useRef(new Set(props.skills));
  for (const name of props.skills) knownSkills.current.add(name);
  const compartment = useRef(new Compartment());
  useImperativeHandle(props.ref, () => ({ focus: () => { focusRequested.current = true; editor.current?.focus(); } }), []);
  useEffect(() => {
    const p = current.current;
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: p.value, selection: { anchor: p.value.length }, extensions: [
      minimalSetup, EditorView.lineWrapping, placeholder(p.placeholder),
      compartment.current.of(skillDecorations([...knownSkills.current])),
      EditorView.contentAttributes.of({ "aria-label": p.placeholder, "aria-multiline": "true", role: "textbox", spellcheck: "true" }),
      Prec.highest(EditorView.domEventHandlers({
        keydown(event) { if (!event.isComposing) current.current.onKeyDown(event); return event.defaultPrevented; },
        paste(event) { current.current.onPaste(event); return event.defaultPrevented; },
      })),
      EditorView.updateListener.of(update => {
        if (update.docChanged && !update.transactions.some(transaction => transaction.annotation(externalChange))) current.current.onChange(update.state.doc.toString(), update.state.selection.main.head, [...new Set(editorSkillTokens(update.state.doc.toString(), [...knownSkills.current]).map(token => token.name))]);
        if (update.selectionSet || update.docChanged) current.current.onCaretChange(update.state.selection.main.head);
      }),
    ] }) });
    editor.current = view;
    p.onCaretChange(p.value.length);
    if (p.autoFocus || focusRequested.current) view.focus();
    let height = host.current!.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = host.current?.clientHeight ?? height;
      if (next !== height) { height = next; current.current.onHeightChange?.(); }
    });
    observer.observe(host.current!);
    return () => { observer.disconnect(); view.destroy(); editor.current = null; };
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    const before = view.state.doc.toString();
    if (before !== props.value) {
      // Preserve the suffix and caret when a slash command is replaced in the middle.
      let from = 0; while (from < before.length && from < props.value.length && before[from] === props.value[from]) from++;
      let oldEnd = before.length, newEnd = props.value.length;
      while (oldEnd > from && newEnd > from && before[oldEnd - 1] === props.value[newEnd - 1]) { oldEnd--; newEnd--; }
      view.dispatch({ changes: { from, to: oldEnd, insert: props.value.slice(from, newEnd) }, selection: { anchor: newEnd }, annotations: externalChange.of(true) });
    }
  }, [props.value]);
  const skillsKey = JSON.stringify(props.skills);
  useEffect(() => {
    editor.current?.dispatch({ effects: compartment.current.reconfigure(skillDecorations([...knownSkills.current])) });
  }, [skillsKey]);
  return <div className="skill-prompt-editor" ref={host} />;
}
