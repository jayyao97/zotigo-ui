export interface TextRange {
  start: number;
  end: number;
}
// Native TextInput selection offsets are UTF-16 indices, like String.slice.
export function selectedExcerpt(source: string, range: TextRange) {
  const start = Math.max(0, Math.min(source.length, Math.trunc(range.start)));
  const end = Math.max(start, Math.min(source.length, Math.trunc(range.end)));
  const raw = source.slice(start, end);
  const text = raw.trim();
  return { text, startOffset: start + (text ? raw.indexOf(text) : 0) };
}
export function validExcerpt(text: string): boolean {
  return !!text.trim() && [...text].length <= 8000;
}
