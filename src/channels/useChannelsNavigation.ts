import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";

export interface ChannelsNavigation {
  channelsOpen: boolean;
  repositoriesOpen: boolean;
  setRepositoriesOpen: Dispatch<SetStateAction<boolean>>;
  channelsSidebarActive: boolean;
  channelsSessionVisible: boolean;
  setChannelsSessionVisible: Dispatch<SetStateAction<boolean>>;
  // Bumped by every navigation into or out of channels; callers compare it to drop stale async work.
  channelsNavigationRequest: RefObject<number>;
  // Attached to the sidebar "Channels" entry; focused again after the close transition.
  channelsEntryButton: RefObject<HTMLButtonElement | null>;
  openChannels: () => void;
  closeChannels: () => void;
  leaveChannelsImmediately: () => void;
}

// Owns the channels / repository-library page switch and the sidebar transition into and out of
// channels: the open flags, the transition timer and animation frames, and their cleanup on unmount.
export function useChannelsNavigation(): ChannelsNavigation {
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [repositoriesOpen, setRepositoriesOpen] = useState(false);
  const [channelsSidebarActive, setChannelsSidebarActive] = useState(false);
  const [channelsSessionVisible, setChannelsSessionVisible] = useState(false);
  const channelsTransitionTimer = useRef<number | null>(null);
  const channelsEntryFrames = useRef<number[]>([]);
  const channelsNavigationRequest = useRef(0);
  const channelsEntryButton = useRef<HTMLButtonElement>(null);
  const cancelChannelsTransition = useCallback(() => {
    if (channelsTransitionTimer.current !== null) window.clearTimeout(channelsTransitionTimer.current);
    channelsTransitionTimer.current = null;
    channelsEntryFrames.current.forEach((frame) => window.cancelAnimationFrame(frame));
    channelsEntryFrames.current = [];
  }, []);
  const openChannels = useCallback(() => {
    setRepositoriesOpen(false);
    if (channelsOpen && channelsSidebarActive) return;
    channelsNavigationRequest.current++;
    cancelChannelsTransition();
    setChannelsSessionVisible(false);
    setChannelsOpen(true);
    setChannelsSidebarActive(false);
    const first = window.requestAnimationFrame(() => {
      const second = window.requestAnimationFrame(() => {
        channelsEntryFrames.current = [];
        setChannelsSidebarActive(true);
      });
      channelsEntryFrames.current = [second];
    });
    channelsEntryFrames.current = [first];
  }, [cancelChannelsTransition, channelsOpen, channelsSidebarActive]);
  const closeChannels = useCallback(() => {
    channelsNavigationRequest.current++;
    cancelChannelsTransition();
    setChannelsSidebarActive(false);
    channelsTransitionTimer.current = window.setTimeout(() => {
      channelsTransitionTimer.current = null;
      setChannelsOpen(false);
      setChannelsSessionVisible(false);
      window.requestAnimationFrame(() => channelsEntryButton.current?.focus());
    }, 200);
  }, [cancelChannelsTransition]);
  const leaveChannelsImmediately = useCallback(() => {
    setRepositoriesOpen(false);
    channelsNavigationRequest.current++;
    cancelChannelsTransition();
    setChannelsSidebarActive(false);
    setChannelsOpen(false);
    setChannelsSessionVisible(false);
  }, [cancelChannelsTransition]);
  useEffect(() => () => {
    channelsNavigationRequest.current++;
    cancelChannelsTransition();
  }, [cancelChannelsTransition]);

  return {
    channelsOpen, repositoriesOpen, setRepositoriesOpen, channelsSidebarActive, channelsSessionVisible, setChannelsSessionVisible,
    channelsNavigationRequest, channelsEntryButton, openChannels, closeChannels, leaveChannelsImmediately,
  };
}
