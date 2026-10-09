import type { SkillSummary } from "./zotigod";

export interface SkillCommandQuery {
  query: string;
  start: number;
}

export function skillCommandQuery(prompt: string): SkillCommandQuery | null {
  const match = /(^|\s)\/([a-zA-Z0-9-]*)$/.exec(prompt);
  if (!match) return null;
  return {
    query: match[2].toLocaleLowerCase(),
    start: match.index + match[1].length,
  };
}

export function insertSkillCommand(prompt: string, command: SkillCommandQuery, caret: number, name: string): string {
  return prompt.slice(0, command.start) + "[$" + name + "] " + prompt.slice(caret);
}

export function matchingSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  return skills.filter((skill) =>
    !normalized
    || skill.name.toLocaleLowerCase().includes(normalized)
    || skill.description.toLocaleLowerCase().includes(normalized),
  );
}

export function skillTokens(prompt: string, names: readonly string[]): { from: number; to: number; name: string }[] {
  const known = new Set(names);
  return [...prompt.matchAll(/\$([a-zA-Z0-9][a-zA-Z0-9_.:/-]*)/g)]
    .filter(match => known.has(match[1]))
    .map(match => ({ from: match.index!, to: match.index! + match[0].length, name: match[1] }));
}

// The editor stores a bounded reference, so adjacent prose cannot become part of its name.
// Only explicitly selected (or undo-restored) names are treated as tokens.
export function editorSkillTokens(prompt: string, names: readonly string[]) {
  const known = new Set(names);
  return [...prompt.matchAll(/\[\$([a-zA-Z0-9][a-zA-Z0-9_.:/-]*)\]/g)]
    .filter(match => known.has(match[1]))
    .map(match => ({ from: match.index!, to: match.index! + match[0].length, name: match[1] }));
}

export function skillPromptText(prompt: string, names: readonly string[]): string {
  let text = "", start = 0;
  for (const token of editorSkillTokens(prompt, names)) {
    text += prompt.slice(start, token.from) + "$" + token.name;
    if (/[a-zA-Z0-9_.:/-]/.test(prompt[token.to] ?? "")) text += " ";
    start = token.to;
  }
  return text + prompt.slice(start);
}
