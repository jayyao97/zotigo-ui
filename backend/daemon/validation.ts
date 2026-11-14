
export function expectRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function expectArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${context} must be an array`);
  return value;
}

export function expectStringArray(value: unknown, context: string): string[] {
  return expectArray(value, context).map((item, index) => expectString(item, `${context}[${index}]`));
}

export function expectStringList(value: unknown, context: string): string[] {
  return expectArray(value, context).map((item, index) => expectString(item, `${context}[${index}]`));
}

export function expectNullableString(value: unknown, context: string): string | null {
  return value === null || value === undefined ? null : expectString(value, context);
}

export function expectNullableNumber(value: unknown, context: string): number | null {
  return value === null || value === undefined ? null : expectNumber(value, context);
}

export function expectNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context} must be a number`);
  }
  return value;
}

export function expectBoolean(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${context} must be a boolean`);
  }
  return value;
}

export function expectString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string`);
  }
  return value;
}

export function expectOptionalNumber(value: unknown, context: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectNumber(value, context);
}

export function expectOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectString(value, context);
}

export function expectOptionalBoolean(value: unknown, context: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return expectBoolean(value, context);
}

export function parseOptionalArray<T>(
  value: unknown,
  context: string,
  parseItem: (value: unknown, context: string) => T,
): T[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
  return value.map((item, index) => parseItem(item, `${context}[${index}]`));
}
