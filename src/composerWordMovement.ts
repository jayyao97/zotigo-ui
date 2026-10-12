import { editorSkillTokens } from "../shared/skillCommands";

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

// CodeMirror's default groups classify contiguous Han characters as one word.
// Use language-aware boundaries for prose while keeping skill widgets atomic.
export function composerWordPosition(text: string, position: number, forward: boolean, skills: string[]): number {
  let next = forward ? text.length : 0;
  const lineStart = position === 0 ? 0 : text.lastIndexOf("\n", position - 1) + 1;
  const lineEnd = text.indexOf("\n", position);
  const start = forward ? position : lineStart;
  const end = forward ? (lineEnd === -1 ? text.length : lineEnd) : position;
  // Segment the entire line so a cursor inside a word still finds its boundary.
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  for (const part of segmenter.segment(line)) {
    if (!part.segment.trim()) continue;
    const from = lineStart + part.index, to = from + part.segment.length;
    if (forward && to > start) { next = to; break; }
    if (!forward && from < end) next = from;
  }
  if (forward && next === text.length && lineEnd !== -1) next = lineEnd + 1;
  if (!forward && next === 0 && lineStart > 0) next = lineStart - 1;
  for (const token of editorSkillTokens(text, skills)) {
    if (next > token.from && next < token.to) next = forward ? token.to : token.from;
  }
  return next;
}
