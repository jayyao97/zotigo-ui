import { t } from "@zotigo/shared/i18n/index";
import * as Clipboard from "expo-clipboard";
import Check from "lucide-react-native/icons/check";
import Hash from "lucide-react-native/icons/hash";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { ListRow, errorText } from "./ui";

/**
 * A row that copies an ID, for pasting into a Channel's /bind, a script or a
 * bug report (Desktop offers the same in its sidebar menus). The row confirms
 * with a check and the copied ID for a moment.
 */
export function CopyIdRow({ title, id }: { title: string; id: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <ListRow
      icon={copied ? Check : Hash}
      title={title}
      subtitle={copied ? t("app.copiedId", { id }) : undefined}
      chevron={false}
      onPress={() =>
        void Clipboard.setStringAsync(id)
          .then(() => setCopied(true))
          .catch((e) => Alert.alert(t("mobile.copyFailed"), errorText(e)))
      }
    />
  );
}
