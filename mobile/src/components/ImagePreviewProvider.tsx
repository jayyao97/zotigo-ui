import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  Modal,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import { IconButton, colors, styles } from "./ui";
const ImagePreviewContext = createContext<((uri: string) => void) | null>(null);
/** Retain the selected URI even when its virtualized message leaves the list. */
export function ImagePreviewProvider({ children }: { children: ReactNode }) {
  const [uri, setUri] = useState<string>();
  const [error, setError] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = useCallback((value: string) => {
    setError(false);
    setUri(value);
  }, []);
  return (
    <ImagePreviewContext.Provider value={open}>
      {children}
      {uri && (
        <Modal
          visible
          animationType="fade"
          onRequestClose={() => setUri(undefined)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }}
          >
            <View style={{ alignItems: "flex-end", paddingHorizontal: 12 }}>
              <IconButton
                icon={X}
                label="Close image preview"
                onPress={() => setUri(undefined)}
              />
            </View>
            {error ? (
              <Text style={styles.muted}>Image could not be loaded.</Text>
            ) : (
              <ScrollView
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
                contentContainerStyle={{
                  flexGrow: 1,
                  justifyContent: "center",
                }}
              >
                <Image
                  source={{ uri }}
                  resizeMode="contain"
                  onError={() => setError(true)}
                  style={{
                    width,
                    height: height - insets.top - insets.bottom - 60,
                  }}
                  accessibilityLabel="Expanded conversation attachment"
                />
              </ScrollView>
            )}
          </View>
        </Modal>
      )}
    </ImagePreviewContext.Provider>
  );
}
export function useImagePreview() {
  return useContext(ImagePreviewContext);
}
