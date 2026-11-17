import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Platform,
  type FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { TimelineFollow } from "../../core/timelineFollow";
import type { TimelineRow } from "../../core/timelineRows";
import { HistoryPaginationGesture, TimelineScrollMetrics } from "../../core/timelineScroll";

type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/**
 * Scroll ownership for the transcript: follow the latest message until the
 * user scrolls away, show "jump to latest" from measured distance, and load
 * older history only from a fresh upward gesture. The decisions live in
 * `core/timelineFollow` and `core/timelineScroll`; this hook wires them to the
 * list. Native lists are inverted, the web preview is not.
 */
export function useTimelineScroll({
  focused,
  loadingOlder,
  loading,
  more,
  onLoadOlder,
  onUserScroll,
}: {
  focused: RefObject<boolean>;
  loadingOlder: boolean;
  loading: boolean;
  more: boolean;
  onLoadOlder: () => void;
  /** The user took over scrolling: keep what they are reading in place. */
  onUserScroll: () => void;
}) {
  const list = useRef<FlatList<TimelineRow>>(null);
  const follow = useRef(new TimelineFollow());
  const historyGesture = useRef(new HistoryPaginationGesture());
  const inverted = Platform.OS !== "web";
  const scrollMetrics = useRef(new TimelineScrollMetrics(inverted));
  const [following, setFollowing] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );
  /** Stop following without a scroll gesture (text selection, expanding a group). */
  const leaveLatest = useCallback(() => {
    follow.current.leaveLatest();
    setFollowing(false);
  }, []);
  const distanceFromLatest = ({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent) =>
    inverted ? contentOffset.y : contentSize.height - contentOffset.y - layoutMeasurement.height;
  const distanceFromOldest = ({ contentOffset, contentSize, layoutMeasurement }: NativeScrollEvent) =>
    inverted ? contentSize.height - contentOffset.y - layoutMeasurement.height : contentOffset.y;
  function scheduleFollowCorrection() {
    if (follow.current.following && !loadingOlder && !scrollTimer.current)
      scrollTimer.current = setTimeout(() => {
        scrollTimer.current = undefined;
        if (focused.current && follow.current.following) {
          const offset = scrollMetrics.current.correction();
          if (offset !== undefined) list.current?.scrollToOffset({ offset, animated: false });
        }
      }, 80);
  }
  function scrollToLatest() {
    historyGesture.current.cancel();
    scrollMetrics.current.resetCorrection();
    follow.current.jump();
    setShowJump(false);
    setFollowing(true);
    if (inverted) list.current?.scrollToOffset({ offset: 0, animated: true });
    else list.current?.scrollToEnd({ animated: true });
  }
  function userScrolled(drag: boolean) {
    if (!loadingOlder && !loading) historyGesture.current.arm();
    scrollMetrics.current.resetCorrection();
    if (drag) follow.current.beginDrag();
    else follow.current.leaveLatest();
    onUserScroll();
    setFollowing(false);
  }
  const listProps = {
    ref: list,
    inverted,
    scrollEventThrottle: 32,
    maintainVisibleContentPosition: following ? undefined : { minIndexForVisible: 0 },
    // The web preview has no drag callbacks; an upward wheel is the same intent.
    ...(Platform.OS === "web"
      ? {
          onWheel: (event: { deltaY: number }) => {
            if (event.deltaY < 0) userScrolled(false);
          },
        }
      : {}),
    onScrollBeginDrag: () => userScrolled(true),
    onScrollEndDrag: (event: ScrollEvent) => {
      follow.current.observeDistance(distanceFromLatest(event.nativeEvent));
      setFollowing(follow.current.endDrag(event.nativeEvent.velocity?.y));
      setShowJump(follow.current.showJump);
    },
    onMomentumScrollBegin: () => {
      follow.current.beginMomentum();
      setFollowing(follow.current.following);
    },
    onMomentumScrollEnd: (event: ScrollEvent) => {
      follow.current.observeDistance(distanceFromLatest(event.nativeEvent));
      setFollowing(follow.current.endMomentum());
      setShowJump(follow.current.showJump);
    },
    onScroll: (event: ScrollEvent) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      scrollMetrics.current.offset = contentOffset.y;
      scrollMetrics.current.contentHeight = contentSize.height;
      scrollMetrics.current.viewportHeight = layoutMeasurement.height;
      setFollowing(follow.current.observeDistance(distanceFromLatest(event.nativeEvent)));
      setShowJump(follow.current.showJump);
      if (
        historyGesture.current.consume(
          follow.current.following,
          distanceFromOldest(event.nativeEvent),
          more && !loadingOlder && !loading,
        )
      )
        onLoadOlder();
    },
    onLayout: (event: LayoutChangeEvent) => {
      scrollMetrics.current.viewportHeight = event.nativeEvent.layout.height;
      scheduleFollowCorrection();
    },
    onContentSizeChange: (_: number, height: number) => {
      scrollMetrics.current.contentHeight = height;
      scheduleFollowCorrection();
    },
  };
  return { listProps, inverted, following, showJump, leaveLatest, scrollToLatest };
}
