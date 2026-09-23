import { createContext, useContext, useState, type ReactNode } from "react";

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

export function useModelFavorites(host: string) {
  const key = `zotigo.model-favorites.v1:${host}`;
  const [items, setItems] = useState<ModelFavorite[]>(() => {
    try { return parseModelFavorites(localStorage.getItem(key)); } catch { return []; }
  });
  function toggle(favorite: ModelFavorite) {
    const next = items.some((item) => favoriteKey(item) === favoriteKey(favorite))
      ? items.filter((item) => favoriteKey(item) !== favoriteKey(favorite)) : [...items, favorite];
    setItems(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep the preference for this window if storage is unavailable. */ }
  }
  return { items, toggle };
}

const ModelFavoritesContext = createContext<ReturnType<typeof useModelFavorites> | null>(null);

export function ModelFavoritesProvider({ host, children }: { host: string; children: ReactNode }) {
  const favorites = useModelFavorites(host);
  return <ModelFavoritesContext.Provider value={favorites}>{children}</ModelFavoritesContext.Provider>;
}

export function useSavedModelFavorites() {
  const favorites = useContext(ModelFavoritesContext);
  if (!favorites) throw new Error("Model favorites provider is missing.");
  return favorites;
}
