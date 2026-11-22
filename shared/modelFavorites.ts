export type ModelFavorite =
  | { agent: "codex"; model: string; reasoningEffort: string }
  | { agent: "zotigo"; profile: string };

export interface ModelFavoritesControl {
  items: ModelFavorite[];
  select: (favorite: ModelFavorite) => void;
}

export function favoriteKey(favorite: ModelFavorite): string {
  return favorite.agent === "codex"
    ? JSON.stringify([favorite.agent, favorite.model, favorite.reasoningEffort])
    : JSON.stringify([favorite.agent, favorite.profile]);
}

export function parseModelFavorites(raw: string | null): ModelFavorite[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    const result: ModelFavorite[] = [];
    for (const value of values) {
      if (!value || typeof value !== "object") continue;
      let favorite: ModelFavorite;
      if (value.agent === "codex" && typeof value.model === "string" && value.model && typeof value.reasoningEffort === "string") {
        favorite = { agent: "codex", model: value.model, reasoningEffort: value.reasoningEffort };
      } else if (value.agent === "zotigo" && typeof value.profile === "string" && value.profile) {
        favorite = { agent: "zotigo", profile: value.profile };
      } else continue;
      if (!result.some((item) => favoriteKey(item) === favoriteKey(favorite))) result.push(favorite);
    }
    return result;
  } catch { return []; }
}

