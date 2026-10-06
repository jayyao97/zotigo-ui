import { useEffect } from "react";

// iOS can resize/pan the visual viewport without resizing the layout viewport.
export function useWebViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    const update = () => {
      // Keep pinch zoom under browser control instead of relaying out the app.
      if (Math.abs(viewport.scale - 1) > 0.01) return;
      style.setProperty("--web-viewport-height", `${viewport.height}px`);
      style.setProperty("--web-viewport-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      style.removeProperty("--web-viewport-height");
      style.removeProperty("--web-viewport-top");
    };
  }, []);
}
