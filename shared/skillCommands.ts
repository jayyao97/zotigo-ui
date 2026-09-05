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

export function removeSkillCommand(prompt: string, command: SkillCommandQuery): string {
  return prompt.slice(0, command.start);
}

export function matchingSkills(skills: SkillSummary[], query: string): SkillSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  return skills.filter((skill) =>
    !normalized
    || skill.name.toLocaleLowerCase().includes(normalized)
    || skill.description.toLocaleLowerCase().includes(normalized),
  );
}
