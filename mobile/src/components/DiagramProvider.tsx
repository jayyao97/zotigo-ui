import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Text } from "react-native";
import { styles } from "./ui";
const MermaidPreview = lazy(() => import("./MermaidPreview"));
const DiagramContext = createContext<((source: string) => void) | null>(null);
/** One viewer belongs to the screen, so virtualized rows can safely disappear. */
export function DiagramProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<string>();
  const open = useCallback((next: string) => setSource(next), []);
  return (
    <DiagramContext.Provider value={open}>
      {children}
      {source !== undefined && (
        <Suspense fallback={<Text style={styles.muted}>Loading diagram…</Text>}>
          <MermaidPreview
            source={source}
            onClose={() => setSource(undefined)}
          />
        </Suspense>
      )}
    </DiagramContext.Provider>
  );
}
export function useDiagram() {
  return useContext(DiagramContext);
}
