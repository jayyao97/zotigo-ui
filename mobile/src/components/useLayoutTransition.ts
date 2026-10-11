import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, LayoutAnimation, Platform } from "react-native";

export function useLayoutTransition() {
  const reduced = useRef(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) reduced.current = value;
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reduced.current = value;
      },
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return useCallback(() => {
    if (!reduced.current && Platform.OS !== "web")
      LayoutAnimation.configureNext({
        duration: 220,
        update: { type: "easeInEaseOut" },
        create: { type: "easeInEaseOut", property: "opacity" },
        delete: { type: "easeInEaseOut", property: "opacity" },
      });
  }, []);
}
