import { useEffect, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { useVideoPlayer, VideoView } from "expo-video";
import { maxAttachmentBytes } from "@zotigo/shared/messageFiles";
import { decodedBase64Size } from "@zotigo/shared/messageImages";
import { Notice, errorText } from "./ui";
function Player({ uri }: { uri: string }) {
  const focused = useIsFocused();
  const player = useVideoPlayer(uri);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!focused) player.pause();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    const status = player.addListener("statusChange", (event) => {
      if (event.status === "error")
        setError("This video's encoding cannot be played on this device.");
    });
    return () => {
      subscription.remove();
      status.remove();
    };
  }, [player, focused]);
  return (
    <View>
      <Notice text={error} error />
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={{ width: "100%", height: 280 }}
      />
    </View>
  );
}
export function VideoPreview({
  data,
  mediaType,
}: {
  data: string;
  mediaType: string;
}) {
  const [uri, setUri] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setUri("");
    setError("");
    if (
      !["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"].includes(
        mediaType,
      )
    ) {
      setError("Unsupported video format.");
      return;
    }
    if (decodedBase64Size(data) > maxAttachmentBytes) {
      setError("Video preview is limited to 20 MiB.");
      return;
    }
    if (Platform.OS === "web") {
      setUri(`data:${mediaType};base64,${data}`);
      return;
    }
    const extension =
      mediaType === "video/quicktime"
        ? "mov"
        : mediaType === "video/webm"
          ? "webm"
          : "mp4";
    const file = new File(
      Paths.cache,
      `zotigo-preview-${randomUUID()}.${extension}`,
    );
    try {
      file.write(data, { encoding: "base64" });
      setUri(file.uri);
    } catch (e) {
      setError(errorText(e));
    }
    return () => {
      if (file.exists) file.delete();
    };
  }, [data, mediaType]);
  return (
    <View>
      <Notice text={error} error />
      {uri ? (
        <Player key={uri} uri={uri} />
      ) : (
        !error && <Notice text="Loading video…" />
      )}
    </View>
  );
}
