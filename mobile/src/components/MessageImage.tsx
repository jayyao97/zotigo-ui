import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import X from "lucide-react-native/icons/x";
import { useDaemon } from "../platform/context";
import { messageImage } from "../core/messageImages";
import { Action, IconButton, colors, errorText, styles } from "./ui";

export function MessageImage({
  url,
  sessionId,
  thumbnail = false,
}: {
  url: string;
  sessionId: string;
  thumbnail?: boolean;
}) {
  const client = useDaemon();
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [approved, setApproved] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(1.5);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let active = true;
    setUri("");
    setError("");
    setConfirm(false);
    void messageImage(client, url, sessionId, approved === url)
      .then((value) => {
        if (!active) return;
        if (value === null) setConfirm(true);
        else {
          setUri(value);
          Image.getSize(value, (w, h) => {
            if (active && w && h) setRatio(w / h);
          }, () => { /* The rendered image owns load errors and retry. */ });
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [client, url, sessionId, attempt, approved]);
  return (
    <View style={thumbnail ? { width: 80 } : { width: "100%" }}>
      {uri && !error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preview image"
          onPress={() => setOpen(true)}
        >
          <Image
            source={{ uri }}
            resizeMode="contain"
            accessibilityLabel="Conversation attachment"
            onError={() => setError("Image could not be loaded.")}
            style={{
              width: "100%",
              height: thumbnail ? 80 : Math.min(400, (width - 36) / ratio),
              borderRadius: 10,
              backgroundColor: colors.surface,
            }}
          />
        </Pressable>
      ) : error || confirm ? (
        <View>
          <Text style={styles.muted}>
            {confirm ? "Image outside workspace" : error}
          </Text>
          <Action
            label={confirm ? "Allow image preview" : "Retry image"}
            onPress={() => {
              if (confirm) setApproved(url);
              else setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : (
        <View
          style={{ height: thumbnail ? 80 : 120, justifyContent: "center" }}
        >
          <ActivityIndicator
            color={colors.muted}
            accessibilityLabel="Loading image"
          />
        </View>
      )}
      <Modal
        visible={open}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
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
              onPress={() => setOpen(false)}
            />
          </View>
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          >
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={{
                width,
                height: height - insets.top - insets.bottom - 60,
              }}
              accessibilityLabel="Expanded conversation attachment"
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
