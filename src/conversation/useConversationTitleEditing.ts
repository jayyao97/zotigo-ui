import { useLayoutEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from "react";
import type { ClientApi, DesktopConversation, DesktopState } from "../../shared/clientTypes";
import { t } from "../../shared/i18n/index";
import { errorMessage } from "../app/appHelpers";

export interface ConversationTitleEditingArgs {
  conversations: DesktopState["conversations"];
  client: Pick<ClientApi, "renameConversation">;
  applyDesktopState: (update: SetStateAction<DesktopState>) => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
}

export interface ConversationTitleEditing {
  isEditingConversationTitle: boolean;
  isSavingConversationTitle: boolean;
  conversationTitleDraft: string;
  setConversationTitleDraft: Dispatch<SetStateAction<string>>;
  // Attached to the inline title input; focused and selected when editing starts.
  conversationTitleInputRef: RefObject<HTMLInputElement | null>;
  renameDialogConversation: DesktopConversation | null;
  renameDialogTitleDraft: string;
  setRenameDialogTitleDraft: Dispatch<SetStateAction<string>>;
  // Leaves inline editing and sets the draft; App calls this when the selection changes.
  resetConversationTitleDraft: (title: string) => void;
  // The inline handlers take the selected conversation of the render they are called from.
  beginConversationTitleEdit: (selectedConversation: DesktopConversation | null) => void;
  cancelConversationTitleEdit: (selectedConversation: DesktopConversation | null) => void;
  saveConversationTitle: (selectedConversation: DesktopConversation | null) => Promise<void>;
  openRenameConversationDialog: (conversation: DesktopConversation) => void;
  closeRenameConversationDialog: () => void;
  submitRenameConversationDialog: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

// Owns conversation renaming: the inline title edit in the title bar and the rename-conversation
// dialog, which share one saving flag and one persist call.
export function useConversationTitleEditing({ conversations, client, applyDesktopState, setMessage }: ConversationTitleEditingArgs): ConversationTitleEditing {
  const [isEditingConversationTitle, setIsEditingConversationTitle] = useState(false);
  const [isSavingConversationTitle, setIsSavingConversationTitle] = useState(false);
  const [conversationTitleDraft, setConversationTitleDraft] = useState("");
  const [renameDialogConversationId, setRenameDialogConversationId] = useState<string | null>(null);
  const [renameDialogTitleDraft, setRenameDialogTitleDraft] = useState("");
  const conversationTitleInputRef = useRef<HTMLInputElement | null>(null);
  const renameDialogConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === renameDialogConversationId) ?? null,
    [conversations, renameDialogConversationId],
  );

  useLayoutEffect(() => {
    if (!isEditingConversationTitle) {
      return;
    }
    conversationTitleInputRef.current?.focus();
    conversationTitleInputRef.current?.select();
  }, [isEditingConversationTitle]);

  function resetConversationTitleDraft(title: string) {
    setIsEditingConversationTitle(false);
    setConversationTitleDraft(title);
  }

  function beginConversationTitleEdit(selectedConversation: DesktopConversation | null) {
    if (!selectedConversation) {
      return;
    }
    setMessage(null);
    setConversationTitleDraft(selectedConversation.title);
    setIsEditingConversationTitle(true);
  }

  function cancelConversationTitleEdit(selectedConversation: DesktopConversation | null) {
    setConversationTitleDraft(selectedConversation?.title ?? "");
    setIsEditingConversationTitle(false);
  }

  async function persistConversationTitle(conversationId: string, draft: string): Promise<string | null> {
    if (isSavingConversationTitle) {
      return null;
    }
    const title = draft.trim();
    if (!title) {
      setMessage(t("app.conversationTitleIsRequired"));
      return null;
    }

    setIsSavingConversationTitle(true);
    setMessage(null);
    try {
      applyDesktopState(await client.renameConversation(conversationId, title));
      return title;
    } catch (error) {
      setMessage(errorMessage(error));
      return null;
    } finally {
      setIsSavingConversationTitle(false);
    }
  }

  async function saveConversationTitle(selectedConversation: DesktopConversation | null) {
    if (!selectedConversation) {
      return;
    }
    if (conversationTitleDraft.trim() === selectedConversation.title) {
      setIsEditingConversationTitle(false);
      return;
    }
    const title = await persistConversationTitle(selectedConversation.id, conversationTitleDraft);
    if (title) {
      setConversationTitleDraft(title);
      setIsEditingConversationTitle(false);
    } else {
      conversationTitleInputRef.current?.focus();
    }
  }

  function openRenameConversationDialog(conversation: DesktopConversation) {
    setMessage(null);
    setRenameDialogConversationId(conversation.id);
    setRenameDialogTitleDraft(conversation.title);
  }

  function closeRenameConversationDialog() {
    if (isSavingConversationTitle) {
      return;
    }
    setRenameDialogConversationId(null);
    setRenameDialogTitleDraft("");
  }

  async function submitRenameConversationDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameDialogConversation) {
      return;
    }
    if (renameDialogTitleDraft.trim() === renameDialogConversation.title) {
      closeRenameConversationDialog();
      return;
    }
    const title = await persistConversationTitle(renameDialogConversation.id, renameDialogTitleDraft);
    if (title) {
      closeRenameConversationDialog();
    }
  }

  return {
    isEditingConversationTitle, isSavingConversationTitle, conversationTitleDraft, setConversationTitleDraft,
    conversationTitleInputRef, renameDialogConversation, renameDialogTitleDraft, setRenameDialogTitleDraft,
    resetConversationTitleDraft, beginConversationTitleEdit, cancelConversationTitleEdit, saveConversationTitle,
    openRenameConversationDialog, closeRenameConversationDialog, submitRenameConversationDialog,
  };
}
