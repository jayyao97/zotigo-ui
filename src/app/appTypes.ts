import type { DragEvent } from "react";
import type { FolderSourceMode } from "../../shared/zotigod";
import type { DesktopProjectRepository, SourceCandidate } from "../../shared/clientTypes";
import type { DropPosition } from "../../shared/sidebarOrdering";
import type { ComposerAttachment } from "../conversation/ConversationComposer";
import type { ComposerDraftState } from "../composerDrafts";

export type ConnectionState = "checking" | "online" | "offline";
export type WorkspaceRepositoryDraft = {
  repository: DesktopProjectRepository;
  selected: boolean;
  baseRef: string;
};
export type ProjectSourceDraft = {
  candidate: SourceCandidate;
  folderMode: FolderSourceMode;
};
export type SidebarDragItem = {
  kind: "project" | "workspace" | "workspace-session" | "pinned-session";
  id: string;
  scopeId: string;
};
export type SidebarDropTarget = SidebarDragItem & { position: DropPosition };
export type SidebarSortProps = {
  draggable: boolean;
  dragging: boolean;
  dropPosition?: DropPosition;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
};
export type ComposerDraft = ComposerDraftState<ComposerAttachment>;
export type ConversationContextMenu = {
  conversationId: string;
  x: number;
  y: number;
};
