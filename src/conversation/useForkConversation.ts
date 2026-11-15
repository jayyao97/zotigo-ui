import { useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ClientApi, DesktopActionResult, DesktopState } from "../../shared/clientTypes";
import { createForkRequestId } from "../../shared/sessionFork";
import { errorMessage } from "../app/appHelpers";
import type { SkillPromptEditorHandle } from "../SkillPromptEditor";

export interface ForkConversationArgs {
  client: Pick<ClientApi, "forkConversation">;
  isBusy: boolean;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  // Focused after the fork has been selected.
  composerTextareaRef: RefObject<SkillPromptEditorHandle | null>;
  // Hoisted function declarations in App; they read the bindings of the render they were passed from.
  applyDesktopActionResult: (result: DesktopActionResult) => void;
  selectConversation: (id: string, sourceState: DesktopState) => void;
}

export interface ForkConversation {
  forkConversation: (conversationId: string, throughTurnId?: string) => Promise<void>;
}

// Forks a conversation, optionally through a turn, and selects the fork. Owns the in-flight guard
// and the request ids that make a retried fork idempotent.
export function useForkConversation({
  client, isBusy, setIsBusy, setMessage, composerTextareaRef, applyDesktopActionResult, selectConversation,
}: ForkConversationArgs): ForkConversation {
  const forkRequestsRef = useRef(new Map<string, string>());
  const forkInFlightRef = useRef(false);

  async function forkConversation(conversationId: string, throughTurnId?: string) {
    if (isBusy || forkInFlightRef.current) return;
    forkInFlightRef.current = true;
    setIsBusy(true);
    setMessage(null);
    try {
      const requestKey = JSON.stringify([conversationId, throughTurnId ?? null]);
      const requestId = forkRequestsRef.current.get(requestKey) ?? createForkRequestId();
      // Preserve the request identity on an uncertain response, including a catalog refresh failure.
      forkRequestsRef.current.set(requestKey, requestId);
      const result = await client.forkConversation(conversationId, requestId, throughTurnId);
      applyDesktopActionResult(result);
      if (result.error) throw new Error(result.error);
      const binding = result.state?.bindings.find((value) => value.daemon_session_id === result.session?.id);
      if (binding && result.state) {
        selectConversation(binding.conversation_id, result.state);
        window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
      }
      forkRequestsRef.current.delete(requestKey);
    } catch (error) { setMessage(errorMessage(error)); }
    finally { forkInFlightRef.current = false; setIsBusy(false); }
  }

  return { forkConversation };
}
