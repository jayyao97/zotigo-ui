---
name: zotigo-codex-design-system
description: "Use when modifying Zotigo Desktop or Web UI. Preserve the independently authored dark workbench, conversation layout, translucent desktop sidebar, typography and component conventions; use Codex only as a visual reference, not as a source of code or assets."
---

# Zotigo Codex Design System

Use this skill before Zotigo client UI changes. Preserve the existing workbench and shared component conventions. The maintainer confirmed during open-source preparation that the styles were independently written using the Codex interface only as a visual reference. Do not extract or copy third-party app source CSS, fonts or other proprietary assets. Similar appearance and token names do not establish permission to copy source.

## Product Shape

- Build a dense desktop tool, not a landing page.
- Primary information architecture:
  - left: navigation, pinned sessions, projects grouped by directory
  - center: selected session conversation/history
  - right: floating inspector for environment, git, tasks, sources, session metadata
- Default and empty states should still look like the app shell.
- UI grouping may stay local until zotigod exposes project/transcript fields.

## App Chrome

- macOS window should use native traffic lights only.
- Electron window:
  - `titleBarStyle: "hiddenInset"`
  - `trafficLightPosition` around `x: 16, y: 16`
  - transparent window background (`transparent: true`, `backgroundColor: "#00000000"`)
  - macOS sidebar material (`vibrancy: "sidebar"`, `visualEffectState: "active"`)
- Sidebar top reserves about `48px` for traffic lights.
- Draggable regions:
  - sidebar background and center title bar can use `-webkit-app-region: drag`
  - buttons, inputs, lists, composer, inspector controls use `no-drag`

## Layout

Use a three-column grid for wide Desktop windows. These minimum dimensions do not apply to Web; narrow browser layouts must keep navigation, conversation and file tools accessible without horizontal page overflow.

```css
grid-template-columns: clamp(240px, 300px, min(520px, calc(100vw - 320px))) minmax(560px, 1fr) 320px;
min-width: 1120px;
min-height: 700px;
```

- Left sidebar: translucent, full height, around `300px` on normal desktop.
- Center: full-height conversation surface, narrow readable content column.
- Right inspector: fixed width, dark background with stacked rounded panels.
- Conversation content width: `min(48rem, calc(100% - 64px))`.
- Bottom composer aligns with conversation content width.

## Tokens

Prefer CSS variables in project UI files so future changes are one-hop. Keep the token shape close to Codex:

1. base palette (`--gray-*`, `--blue-*`, etc.)
2. semantic tokens (`--color-background-*`, `--color-text-*`, `--color-border-*`)
3. component aliases (`--surface`, `--text`, `--border`) used by Zotigo UI

```css
--spacing: 4px;
--toolbar: 46px;
--toolbar-sm: 36px;
--toolbar-pane: 40px;
--nav-row: 30px;
--row-x: 10px;
--panel-padding-compact: 12px;
--panel-padding: 20px;
--sidebar-footer-height: 72px;
```

### Color

Core neutral scale:

```css
--gray-0: #fff;
--gray-50: #f9f9f9;
--gray-100: #ededed;
--gray-300: #afafaf;
--gray-500: #5d5d5d;
--gray-550: #4f4f4f;
--gray-600: #414141;
--gray-700: #303030;
--gray-750: #282828;
--gray-800: #212121;
--gray-900: #181818;
--gray-1000: #0d0d0d;
```

Zotigo surfaces:

```css
--color-background-surface: var(--gray-900);
--color-background-surface-under: #000;
--color-background-editor-opaque: var(--gray-800);
--color-background-elevated-primary: color-mix(in oklab, var(--gray-800) 96%, transparent);
--color-background-elevated-secondary: color-mix(in oklab, var(--gray-0) 3%, transparent);
--color-text-foreground: var(--gray-0);
--color-text-foreground-secondary: color-mix(in oklab, var(--gray-0) 70%, transparent);
--color-text-foreground-tertiary: color-mix(in oklab, var(--gray-0) 50%, transparent);
--color-border: color-mix(in oklab, var(--gray-0) 8%, transparent);
--color-border-heavy: color-mix(in oklab, var(--gray-0) 16%, transparent);
--color-border-light: color-mix(in oklab, var(--gray-0) 4%, transparent);
--color-border-focus: color-mix(in oklab, var(--blue-300) 70%, transparent);
--app-bg: #181818;
--surface: #212121;
--surface-elevated: #282828;
--surface-row: #303030;
--text: #ededed;
--text-muted: #afafaf;
--text-dim: #777;
--border: rgb(255 255 255 / 0.08);
--border-heavy: rgb(255 255 255 / 0.12);
--sidebar-bg: color-mix(in srgb, var(--color-token-editor-background) 55%, transparent);
```

Zotigo surface conventions:

- Electron app/body are transparent; opaque surfaces are applied to the center/right panels.
- Keep the sidebar's translucent material separate from the opaque conversation surface. Avoid an extension pseudo-element unless its stacking is verified not to cover content.
- Use this repository's semantic surface variables so a theme adjustment stays local. The examples below describe the existing appearance; they are not requirements to match another application's implementation.

Accents:

```css
--green: #40c977;
--green-strong: #04b84c;
--red: #ff6764;
--red-strong: #fa423e;
--orange: #ff8549;
--orange-strong: #fb6a22;
--blue: #339cff;
--blue-strong: #0285ff;
```

Rules:

- Overall app is dark charcoal, not pure black.
- Sidebar is translucent editor material over the transparent Electron window, not a translucent brand color painted on top of a solid body background.
- Avoid beige/white dashboard surfaces and decorative gradient blobs.
- Use orange sparingly for capability/access/pin/accent.
- Borders are weak alpha strokes; shadows are subtle.

### Typography

Sans stack:

```css
"OpenAI Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

The existing stack may use `OpenAI Sans` only if independently available on the user's system; this repository does not distribute that font. System fallbacks must remain usable. Do not add extracted font files or require users to install a proprietary font.

Mono stack:

```css
ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace
```

Scale:

- `11-12px`: compact metadata, tiny labels
- `13px`: sidebar secondary text, inspector rows
- `14px`: default body and UI text
- `16px`: chat/conversation body emphasis
- `18px`: compact heading
- `24px`: rare large heading only when the surface needs it

Weights:

- normal `400`
- Electron body/default `430-445`
- medium `500`
- semibold `600`
- bold `700`

Rules:

- No negative letter spacing.
- Do not use hero-scale type.
- Prefer `430-500` for routine sidebar/inspector text.
- Use semibold only for selected rows, project names, titles, and important labels.
- Avoid `800+` weights in normal UI; they make the shell look like a web dashboard instead of Codex.

### Radius And Shape

Base radii:

```css
--corner-radius-scale: 1;
--codex-corner-radius-scale: 1.25; /* only inside @supports corner-shape */
--codex-corner-shape: superellipse(1.5);
--radius-2xs: 2px;
--radius-xs: 4px;
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 10px;
--radius-xl: 12px;
--radius-2xl: 16px;
--radius-3xl: 20px;
--radius-4xl: 24px;
--radius-full: 9999px;
```

- Sidebar rows and normal buttons: `8px`.
- History cards: `10-12px`.
- Message bubbles: `14-16px`.
- Inspector cards: `16-20px`.
- Composer: `20px`.
- If supported, apply `corner-shape: superellipse(1.5)` and `--corner-radius-scale: 1.25` to rounded controls/cards/composer.

### Shadow And Elevation

Codex shadows are weak and mostly used as elevation hints:

```css
--shadow-hairline: 0 0 0 0.5px #0000001a;
--shadow-sm: 0 1px 2px -1px #00000014;
--shadow-md: 0 2px 4px -1px #00000014;
--shadow-lg: 0 4px 8px -2px #0000001a;
--shadow-xl: 0 8px 16px -4px #0000001f;
--shadow-2xl: 0 16px 32px -8px #00000030;
--elevation-stroke: 0 0 0 0.5px var(--color-border);
--elevation-prominent: var(--elevation-stroke), 0 3px 7.5px #0000000a, 0 0 20px #0000000d;
```

- Prefer `--shadow-hairline` for framed cards.
- Use `--elevation-prominent` for the bottom composer and other floating controls.
- Avoid strong glow, large dark shadows, or saturated elevation.

## Left Sidebar

Structure:

1. traffic light/native chrome spacer with lightweight sidebar/back/forward glyphs aligned after the macOS buttons
2. utility actions in Codex density; phase-one unavailable entries may be visible but inert/disabled when needed for shell alignment
3. `Pinned`
4. `Projects`
5. account/status footer

Rules:

- Pinned sessions are above Projects.
- Project rows show chevron, project icon, project/directory name, and count.
- Project groups are collapsible.
- Session rows show title and age; avoid extra badges unless essential.
- Selected row uses translucent highlight around `rgb(255 255 255 / 0.13)`.
- Sidebar row height is `30px`, horizontal row padding is `10px`, selected row radius is around `10px`.
- Sidebar footer is separated by a weak top border and reserves about `72px`.
- Do not let any sidebar extension overlay the center title/content. If the current layout cannot layer it behind the center surface, omit the extension.

## Center Conversation

Structure:

- Top title bar: icon + selected session title + more action.
- Scrollable conversation area.
- Bottom composer overlay.

Rules:

- Center is a conversation/history surface, not a table dashboard.
- Use a centered content column around `48rem`.
- Use timeline dividers for run/status milestones.
- Use message bubbles for notes and compact cards for structured session data.
- Composer stays at the bottom, aligns with content, and has a `20px` radius.
- Empty state should explain the next action inside the conversation surface.

## Right Inspector

Structure:

- Stacked floating cards with `16-20px` radius.
- Common sections:
  - Environment
  - Controls
  - Git
  - Session
  - Tasks/Sources later when real data exists

Rules:

- Right panel background stays dark; individual cards use elevated gray.
- Section headers are muted and compact.
- Rows use icon + label + compact value.
- Do not show fake live data. For missing data, show muted placeholders or omit the section.

## Components

- Icons: use `lucide-react` for action/control glyphs. Keep `strokeWidth` around `1.75-2`, sizes around `14-18px`, and colors muted unless active. Do not use text glyphs as icon stand-ins when a lucide icon exists.
- Buttons: `30-34px` high, `8px` radius, dark translucent background, weak border.
- Inputs: `34px` high, dark background, weak border.
- Labels: `11px`, uppercase only for form labels, muted, bold.
- Cards: weak borders, shallow shadows only when elevated.
- Badges: pill radius with semantic dark backgrounds and colored text.
- Composer: elevated surface, subtle border, shadow, compact bottom controls.

## Implementation Rules

- Prefer plain React local state unless real shared state appears.
- Keep daemon API access in the shared backend application service. Desktop preload/IPC and Web HTTP transport provide the same typed client operations.
- Do not add decorative icons just for this design. Use the established `lucide-react` dependency for necessary controls.
- Avoid marketing copy and feature explanations in visible UI.
- Do not introduce mock routes or fake daemon APIs.
- Preserve Electron security defaults: no renderer Node access.

## Verification Checklist

- `pnpm typecheck`
- `pnpm build`
- Inspect a screenshot for:
  - native traffic lights only, no normal title bar
  - translucent grouped sidebar
  - center conversation layout, not table/dashboard layout
  - right floating inspector cards
  - no overlapping text at minimum desktop width
  - disabled buttons visually disabled
  - offline and empty states still intentional
