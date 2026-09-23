import { parseModelFavorites, type ModelFavorite } from "./modelFavorites";

export function loadLastModelSelection(host: string): ModelFavorite | null {
  try {
    const raw = localStorage.getItem(`zotigo.last-model.v1:${host}`);
    return raw ? parseModelFavorites(`[${raw}]`)[0] ?? null : null;
  } catch { return null; }
}

export function saveLastModelSelection(host: string, selection: ModelFavorite): void {
  // Only explicit choices are saved; catalog loading and settings edits never call this.
  if (selection.agent === "codex" ? !selection.model : !selection.profile) return;
  try { localStorage.setItem(`zotigo.last-model.v1:${host}`, JSON.stringify(selection)); } catch { /* The current window can still use this choice. */ }
}
