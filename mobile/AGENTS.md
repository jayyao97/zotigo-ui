# Mobile client

- React Native + Expo; UI lives here, shared daemon DTOs live in `../shared`.
- Never import Node, Electron, `../backend`, or DOM components into mobile.
- Requests and subscriptions belong to an immutable daemon connection. Dispose old connections when switching hosts. Never retry mutations automatically.
- Tokens live in SecureStore. Do not put tokens in route params, AsyncStorage, logs, screenshots, or query strings.
- Durable daemon items are authoritative. SSE deltas are temporary previews and must not advance the durable cursor.
- Native stack navigation, accessible controls (44 pt minimum), virtualized lists, bounded previews, and foreground-only subscriptions.
- Run `corepack pnpm --filter @zotigo/mobile typecheck`, `test`, and `export:ios`; also run root tests/typecheck/build after workspace changes.
- iOS export on Linux proves bundle construction, not native compilation or device behavior. Record that distinction.
