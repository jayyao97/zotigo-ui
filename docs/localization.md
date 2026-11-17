# UI localization

Desktop and Web share the same English (`en`) and Simplified Chinese (`zh-CN`) catalogs in `shared/i18n/`. Settings → General → Interface language changes the renderer immediately. The preference is stored locally as `zotigo:ui-language`, shared by connections in that client and synchronized across browser tabs. A new installation defaults to English. This preference is independent of the language used to translate selected conversation text.

Mobile uses the same catalogs and language key through AsyncStorage. Settings → General → Language applies to both iPhone and iPad without recreating the conversation or composer; it is independent of translation language and daemon preferences. Native OS dialogs continue to follow the OS language.

iPad also shares Desktop’s sidebar width limits (240–480 pt, leaving at least 420 pt for the conversation). Drag the divider to resize or long-press to reset to 320 pt. Width is saved as a client-wide layout preference and survives switching device connections. Mobile waits for the initial AsyncStorage read before mounting navigation to avoid a first-frame width jump. Phones keep single-pane navigation.

## Adding UI copy

- Add a descriptive feature-scoped key to `shared/i18n/en.ts` and its translation to `zh-CN.ts`. `MessageKey` is inferred from English; the Chinese catalog must implement every key.
- Render with `t("feature.key", { count, name })`. Use named parameters and complete sentences; do not concatenate translated grammar fragments. React escapes interpolated text. Never render catalog strings with `dangerouslySetInnerHTML`.
- For count-dependent English grammar, use `{ one: "...{count}...", other: "...{count}..." }`. Chinese can use a single string. All variants must preserve the same parameter names.
- A component that reads translated text calls `useLocale()` to subscribe to language changes, including memoized components. Keep translated text out of module initialization and memoized results without a locale dependency. Pure formatting helpers can call `t()` at invocation time.
- Include accessibility labels, button titles, empty states, validation messages and notifications. JSX copy is checked by `tests/i18n.test.tsx`; procedural strings need review too.
- Keep wire values, IDs, URLs, paths, model names, code, user/assistant messages, and provider output unchanged. A translated select option needs an explicit stable `value`. UI-owned labels for protocol states use `stateLabel`; unknown values remain visible for diagnosis.
- The catalogs are shared with `mobile/`. Before removing a key as unreferenced, also search `mobile/src`.
- Date/time formatters use `getLocale()`. UI language must not change API payloads, automatic approval prompts, user drafts or translation target settings.

Errors received from a daemon or provider remain their original diagnostic text. Existing transient notifications retain the language in which they were emitted; subsequent notifications use the selected language. OS-provided Electron menus and native dialogs follow the OS language.

## Adding a language

Add a catalog typed as `Record<MessageKey, Message>`, register it in `shared/i18n/index.ts`, extend `Locale`/`isLocale`, and add its native name to the settings language selector. Extend the catalog parity/placeholder tests and check narrow layouts. The renderer does not need separate translated components.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build`. Verify live switching with an unsent draft, a queued message, and a narrow screen. The language setting must not remount the application or change session state.
