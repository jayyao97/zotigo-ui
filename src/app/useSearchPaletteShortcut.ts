import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export interface SearchPaletteShortcut {
  searchOpen: boolean;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
}

// Owns the search palette open flag and the global Cmd/Ctrl+K toggle.
export function useSearchPaletteShortcut(): SearchPaletteShortcut {
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const openSearch = (event: globalThis.KeyboardEvent) => {
      if (document.querySelector("dialog[open]:not(.search-palette)")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !event.altKey && !event.isComposing) { event.preventDefault(); setSearchOpen((open) => !open); }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);
  return { searchOpen, setSearchOpen };
}
