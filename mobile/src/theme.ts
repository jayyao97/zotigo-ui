// One place for color, type, spacing and radius. Screens use these tokens
// instead of literal values so the whole app changes in one hop.
export const colors = {
  background: "#151515",
  surface: "#1f1f1f",
  elevated: "#2a2a2a",
  selected: "#333333",
  pressed: "#2e2e2e",
  text: "#ededed",
  muted: "#a3a3a3",
  faint: "#6f6f6f",
  border: "#2f2f2f",
  separator: "#2a2a2a",
  accent: "#77b7ff",
  accentStrong: "#3b82f6",
  danger: "#ff8582",
  warning: "#ff9f59",
  green: "#67d391",
  userBubble: "#1d3f73",
  searchMatch: "#865719",
  scrim: "rgba(0,0,0,0.35)",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const touch = 44;

export const type = {
  title: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 22 },
  callout: { fontSize: 15, lineHeight: 20 },
  footnote: { fontSize: 13, lineHeight: 18 },
  caption: { fontSize: 12, lineHeight: 16 },
  section: { fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
};
