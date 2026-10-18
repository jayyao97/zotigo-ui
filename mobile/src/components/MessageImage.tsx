import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { useImagePreview } from "./ImagePreviewProvider";
import { useDaemon } from "../platform/context";
import { messageImage } from "../core/messageImages";
import { Action, colors, errorText, styles } from "./ui";

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
  const openImage = useImagePreview();
  const [ratio, setRatio] = useState(1.5);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    let active = true;
    setUri("");
    setRatio(1.5);
    setError("");
    setConfirm(false);
    void messageImage(client, url, sessionId, approved === url)
      .then((value) => {
        if (!active) return;
        if (value === null) setConfirm(true);
        else {
          setUri(value);
          Image.getSize(
            value,
            (w, h) => {
              if (active && w && h) setRatio(w / h);
            },
            () => {
              /* The rendered image owns load errors and retry. */
            },
          );
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
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={thumbnail ? { width: 80 } : { width: "100%" }}
    >
      {uri && !error ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Preview image"
          disabled={!openImage}
          onPress={() => openImage?.(uri)}
        >
          <Image
            source={{ uri }}
            resizeMode="contain"
            accessibilityLabel="Conversation attachment"
            onError={() => setError("Image could not be loaded.")}
            style={{
              width: "100%",
              height: thumbnail ? 80 : Math.min(400, width / ratio),
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
    </View>
  );
}
