export const sidebarMinWidth = 240;
export const sidebarDefaultWidth = 320;
export const sidebarMaxWidth = 480;
export function clampSidebarWidth(value: number, frameWidth: number): number {
  const limit = Math.max(sidebarMinWidth, Math.min(sidebarMaxWidth, frameWidth - 420));
  return Math.round(Math.max(sidebarMinWidth, Math.min(limit, Number.isFinite(value) ? value : sidebarDefaultWidth)));
}
