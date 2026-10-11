import { createContext, useContext, useState, type ReactNode } from "react";

import { favoriteKey, parseModelFavorites, type ModelFavorite } from "../shared/modelFavorites";
export { favoriteKey, parseModelFavorites, type ModelFavorite, type ModelFavoritesControl } from "../shared/modelFavorites";

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
