import type { AgentKind } from "../shared/zotigod";

export interface StreamingTextState {
  visibleText: string;
  wasStreaming: boolean;
}

export interface StreamingTextUpdate {
  state: StreamingTextState;
  onAnimationFrame: boolean;
}

export function shouldSmoothStreaming(agent: AgentKind | undefined, itemStreaming: boolean): boolean {
  return agent !== "codex" && itemStreaming;
}

export function initialStreamingTextState(text: string, streaming: boolean, reduceMotion: boolean): StreamingTextState {
  const animate = streaming && !reduceMotion;
  return { visibleText: animate ? "" : text, wasStreaming: animate };
}

export function planStreamingTextUpdate(
  current: StreamingTextState,
  text: string,
  streaming: boolean,
  reduceMotion: boolean,
): StreamingTextUpdate {
  const animate = !reduceMotion && (streaming || current.wasStreaming);
  if (!text.startsWith(current.visibleText) || !animate) {
    return streamingTextUpdate(current, text, streaming && !reduceMotion, false);
  }
  if (current.visibleText.length >= text.length) {
    return streamingTextUpdate(current, text, streaming, false);
  }
  const visibleText = text.slice(0, nextStreamingTextLength(current.visibleText.length, text));
  return streamingTextUpdate(current, visibleText, streaming || visibleText !== text, true);
}

export function nextStreamingTextLength(currentLength: number, text: string): number {
  if (currentLength >= text.length) return text.length;
  const remaining = text.length - currentLength;
  let nextLength = Math.min(text.length, currentLength + Math.max(1, Math.ceil(remaining * 0.22)));
  const lastCodeUnit = text.charCodeAt(nextLength - 1);
  const nextCodeUnit = text.charCodeAt(nextLength);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff && nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
    nextLength += 1;
  }
  return nextLength;
}

function streamingTextUpdate(
  current: StreamingTextState,
  visibleText: string,
  wasStreaming: boolean,
  onAnimationFrame: boolean,
): StreamingTextUpdate {
  return current.visibleText === visibleText && current.wasStreaming === wasStreaming
    ? { state: current, onAnimationFrame: false }
    : { state: { visibleText, wasStreaming }, onAnimationFrame };
}
