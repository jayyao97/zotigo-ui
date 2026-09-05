import fs from "node:fs";
import path from "node:path";
import type { CatalogSelection } from "../shared/catalogSelection";

export interface WindowBoundsPreference {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Preferences {
  windowBounds?: WindowBoundsPreference;
  selection: CatalogSelection;
  orders: Record<string, string[]>;
}

const emptySelection: CatalogSelection = { projectId: null, workspaceId: null, sessionId: null };
let preferencesPath: string | null = null;
let preferences: Preferences = emptyPreferences();

export function initializePreferencesStore(userDataPath: string): void {
  fs.mkdirSync(userDataPath, { recursive: true });
  preferencesPath = path.join(userDataPath, "desktop-preferences.json");
  preferences = loadPreferences(preferencesPath);
}

export function closePreferencesStore(): void {
  preferencesPath = null;
  preferences = emptyPreferences();
}

export function getWindowBoundsPreference(): WindowBoundsPreference | null {
  return preferences.windowBounds ?? null;
}

export function setWindowBoundsPreference(bounds: WindowBoundsPreference): void {
  preferences.windowBounds = bounds;
  savePreferences();
}

export function getCatalogSelection(): CatalogSelection {
  return { ...preferences.selection };
}

export function setCatalogSelection(selection: CatalogSelection): void {
  if (
    preferences.selection.projectId === selection.projectId
    && preferences.selection.workspaceId === selection.workspaceId
    && preferences.selection.sessionId === selection.sessionId
  ) return;
  preferences.selection = { ...selection };
  savePreferences();
}

export function getCatalogOrder(scope: string): string[] {
  return [...(preferences.orders[scope] ?? [])];
}

export function setCatalogOrder(scope: string, ids: string[]): void {
  if (new Set(ids).size !== ids.length) throw new Error("ordered ids must be unique");
  const current = preferences.orders[scope] ?? [];
  if (current.length === ids.length && current.every((id, index) => id === ids[index])) return;
  preferences.orders[scope] = [...ids];
  savePreferences();
}

function emptyPreferences(): Preferences {
  return { selection: { ...emptySelection }, orders: {} };
}

function loadPreferences(filePath: string): Preferences {
  if (!fs.existsSync(filePath)) return emptyPreferences();
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(value)) return emptyPreferences();
    return {
      windowBounds: parseWindowBounds(value.windowBounds),
      selection: parseSelection(value.selection),
      orders: parseOrders(value.orders),
    };
  } catch (error) {
    console.warn(`[zotigo] ignoring invalid Desktop preferences: ${error instanceof Error ? error.message : String(error)}`);
    return emptyPreferences();
  }
}

function savePreferences(): void {
  if (!preferencesPath) throw new Error("preferences store is not initialized");
  const temporaryPath = `${preferencesPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, preferencesPath);
}

function parseWindowBounds(value: unknown): WindowBoundsPreference | undefined {
  if (!isRecord(value)) return undefined;
  const parts = [value.x, value.y, value.width, value.height];
  if (!parts.every((part) => typeof part === "number" && Number.isFinite(part))) return undefined;
  return {
    x: value.x as number,
    y: value.y as number,
    width: value.width as number,
    height: value.height as number,
  };
}

function parseSelection(value: unknown): CatalogSelection {
  if (!isRecord(value)) return { ...emptySelection };
  return {
    projectId: nullableString(value.projectId),
    workspaceId: nullableString(value.workspaceId),
    sessionId: nullableString(value.sessionId),
  };
}

function parseOrders(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([scope, ids]) =>
    Array.isArray(ids) && ids.every((id) => typeof id === "string") && new Set(ids).size === ids.length
      ? [[scope, [...ids]]]
      : [],
  ));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
