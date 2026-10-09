import { useEffect, useRef, useState } from "react";
import type { DesktopConversation, DesktopState } from "../shared/clientTypes";
import type { DisplayItem } from "../shared/zotigod";
import { titleFromPrompt } from "../shared/conversationTitle";

type Attempt = { count: number; pending: boolean; done: boolean; retryAt: number };

export function useConversationTitle(
  conversation: Pick<DesktopConversation, "id" | "title"> | null,
  items: DisplayItem[],
  suggest: (id: string) => Promise<DesktopState>,
  onTitle: (id: string, previousTitle: string, title: string) => void,
) {
  const attempts = useRef(new Map<string, Attempt>());
  const mounted = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!conversation) return;
    const attempt = attempts.current.get(conversation.id) ?? { count: 0, pending: false, done: false, retryAt: 0 };
    if (attempt.pending || attempt.done || attempt.count >= 3) return;
    const prompt = items.find((item) => item.type === "user_message")?.content
      ?.filter((part) => part.type === "text").map((part) => part.text?.trim() ?? "").filter(Boolean).join("\n");
    if (!prompt || conversation.title !== titleFromPrompt(prompt) || !items.some((item) => item.type === "turn_completed")) return;
    const delay = attempt.retryAt - Date.now();
    if (delay > 0) {
      const timer = window.setTimeout(() => setRevision((value) => value + 1), delay);
      return () => window.clearTimeout(timer);
    }
    attempt.count++;
    attempt.pending = true;
    attempts.current.set(conversation.id, attempt);
    void suggest(conversation.id).then((state) => {
      attempt.done = true;
      const updated = state.conversations.find((item) => item.id === conversation.id);
      if (mounted.current && updated) onTitle(conversation.id, conversation.title, updated.title);
    }).catch(() => {
      attempt.retryAt = Date.now() + attempt.count * 5000;
    }).finally(() => {
      attempt.pending = false;
      if (mounted.current) setRevision((value) => value + 1);
    });
  }, [conversation, items, suggest, onTitle, revision]);
}
