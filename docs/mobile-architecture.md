# Mobile architecture

## Decision and scope

React Native + Expo in `mobile/`, sharing public daemon DTOs and pure display rules through `@zotigo/shared`. Desktop/Web remain in place. Mobile talks directly to each daemon; the Node `backend/` is not shipped. The existing HTTP contract is unchanged. Development remains possible on Linux; iOS native build/signing/device validation requires a Mac or macOS builder.

Mobile uses Zotigo charcoal colors, system fonts, and controls with a minimum 44-point touch target.

## Interaction

Device list is the root. Each saved device has a name, daemon origin and separately stored token, plus test/edit/remove. Entering a device tests it before opening a host-scoped native navigation stack. The stack displays the device name and has an explicit devices action. Device switch unmounts that stack and aborts its network lifetime, so IDs from unrelated daemons never share state. Name/token edits retain the logical host ID; the connection instance is always recreated. Changing the origin adds a separate device and preserves the old device and drafts.

Within a device, Home offers projects, pinned/recent conversations, search, sync and settings. Project loads only its own workspaces and sources. Workspace shows sessions, file access and source/worktree state. New conversation makes workspace, runtime, model/profile and approval policy explicit before creating it. Conversation contains a virtualized timeline, collapsed reasoning/tool details, approvals/questions, and a keyboard-aware composer. File inspection is a separate native screen. Destructive archive actions show daemon previews and confirmation.

## Ownership and invariants

- `core/client.ts`: immutable connection, public endpoint methods, credential-bound origin, structured errors, cancellation and request timeout. No implicit mutation retry; bearer never goes into routes, URLs or external image/link requests.
- `core/hosts.ts`: serialized registry updates; metadata in AsyncStorage, credentials in device-only Keychain via SecureStore. Missing secret is an error, never an anonymous fallback.
- `core/timeline.ts`: durable items authoritative; cursor advances only for durable SSE items. Initial recent history then stream after max sequence. Backfill through current turn boundary recovers approvals outside recent page. Reconnect drops volatile previews, replays durable sequence, dedupes. Focus/AppState own stream lifetime.
- `platform/`: Expo streaming fetch and storage adapters. `screens/`: navigation and user interaction; no Node or filesystem assumptions.
- Existing shared business rules reused without importing desktop renderer. Don't promote speculative shared application frameworks before there are real cross-platform callers.

## Performance

Native FlatList for catalog/transcript, stable item identities and memoized message rendering; live deltas publish at most once per 60ms. Bounded ephemeral previews, lazy image loads/tool expansion, collapsed reasoning, history paging. No all-project details fan-out or all-host background subscriptions. Backgrounded/unfocused conversations abort stream, refresh on resume. Manual file refresh, foreground staleness notices and revision-aware save keep drafts safe. Native scroll/keyboard/selection performance remains a device acceptance item, not something proven by Linux export.

## Catalog loading

Home uses one virtualized list grouped into pinned sessions, projects, and recent sessions. Project details, workspaces, and source management load on navigation rather than through an all-project fan-out. Reads reload on focus or explicit refresh; generation guards reject stale responses. Mutations use single-flight locks and do not retry automatically. Delayed mutation callbacks check route validity before navigating.

## Draft persistence

Composer state is scoped by logical host and session. A send attempt persists its payload and client message ID before submission. Retrying an uncertain result reuses both. State transitions update the cleanup reference before awaiting storage, and navigation removal is blocked while a mutation and its persistence are pending. This prevents an old screen from overwriting a newer draft for the same session.

## Validation boundaries

Behavior tests cover origin and credential isolation, cancellation, SSE fragmentation and replay, message retry identity, workspace-scoped profiles, and file conflict rules. Run mobile typecheck, tests, and iOS bundle export alongside root checks when shared code or workspace configuration changes. Native compilation and device behavior require separate iOS validation; a JavaScript export does not exercise UIKit, Keychain, or the native transport.
