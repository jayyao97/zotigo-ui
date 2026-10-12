import { useEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
import type { DisplayItem } from "@zotigo/shared/zotigod";
import {
  isPlaceholderTitle,
  suggestConversationTitle,
} from "../core/conversationTitle";
import { useDaemon } from "./context";

/** Only replace a generated placeholder; a title edited elsewhere wins. */
export function useConversationTitle(
  id: string,
  items: DisplayItem[],
  onTitle: (title: string) => void,
) {
  const client = useDaemon();
  const focused = useIsFocused();
  const callback = useRef(onTitle);
  callback.current = onTitle;
  const attempted = useRef(new Set<string>());
  const completed = items.some((item) => item.type === "turn_completed");
  const prompt = items
    .find((item) => item.type === "user_message")
    ?.content?.filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  useEffect(() => {
    if (!focused) return;
    let active = true;
    void (async () => {
      const row = (await client.catalog()).find(
        (row) => (row.organization?.session_id ?? row.runtime?.id) === id,
      );
      if (!active || !row) return;
      if (row.organization?.title) callback.current(row.organization?.title);
      if (
        !completed ||
        !prompt ||
        attempted.current.has(id) ||
        !isPlaceholderTitle(row.organization?.title, prompt)
      )
        return;
      attempted.current.add(id);
      const title = await suggestConversationTitle(
        client,
        id,
        row.organization?.title,
        () => active,
      );
      if (active && title) callback.current(title);
    })().catch(() => {
      /* Title suggestions never block an otherwise usable conversation. */
    });
    return () => {
      active = false;
    };
  }, [client, id, focused, completed, prompt]);
}
