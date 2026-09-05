import type { ProjectSourceInput } from "../shared/clientTypes";

export function parseCreateProjectInput(value: unknown): { name: string; sources: ProjectSourceInput[] } {
  const record = recordValue(value, "create project input");
  return {
    name: nonEmptyString(record.name, "project name"),
    sources: record.sources === undefined ? [] : parseProjectSources(record.sources),
  };
}

export function parseProjectSources(value: unknown): ProjectSourceInput[] {
  if (!Array.isArray(value)) throw new Error("sources must be an array");
  return value.map((item, index) => {
    const source = recordValue(item, `sources[${index}]`);
    const folderMode = source.folderMode === undefined ? undefined : stringValue(source.folderMode, `sources[${index}].folderMode`);
    if (folderMode !== undefined && folderMode !== "direct" && folderMode !== "copy" && folderMode !== "reference") throw new Error("folderMode is invalid");
    return {
      path: nonEmptyString(source.path, `sources[${index}].path`),
      folderMode,
    };
  });
}

function recordValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function nonEmptyString(value: unknown, name: string): string {
  const result = stringValue(value, name).trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}
