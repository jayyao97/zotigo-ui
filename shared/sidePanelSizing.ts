export const defaultSidePanelWidth = 520;
export const defaultSidePanelRatio = 0.5;
export const minimumSidePanelWidth = 360;
const minimumConversationWidth = 420;

export function clampSidePanelWidth(requestedWidth: number, availableWidth: number): number {
  const maximumWidth = Math.max(minimumSidePanelWidth, availableWidth - minimumConversationWidth);
  return Math.min(Math.max(requestedWidth, minimumSidePanelWidth), maximumWidth);
}

export function sidePanelWidthForRatio(ratio: number, availableWidth: number): number {
  return clampSidePanelWidth(availableWidth * ratio, availableWidth);
}
