# Mobile architecture

## Decision and scope

React Native + Expo in `mobile/`, sharing public daemon DTOs and pure display rules through `@zotigo/shared`. Desktop/Web remain in place. Mobile talks directly to each daemon; the Node `backend/` is not shipped. The existing HTTP contract is unchanged. Development remains possible on Linux; iOS native build/signing/device validation requires a Mac or macOS builder.

Mobile uses Zotigo charcoal colors, system fonts, and controls with a minimum 44-point touch target.

## Interaction

The guiding rule is "don't make the user think": every screen has one obvious primary action, controls show their current value instead of an unlabeled icon, and rarely used actions live one level deeper rather than beside the common ones.

- **Launch.** The last-used device connects automatically. With no devices, Home shows a single "Connect a device" empty state; with several and none remembered, it shows a device list.
- **Home.** Header: Settings (left), New conversation (right). Below it, the current device appears as a small status pill (green dot + name). Tapping it opens a switcher sheet listing devices plus Add/Manage. Then come search and one virtualized list: Pinned, Recent, Projects. Recent comes before the tree because continuing a conversation should not require remembering which project and workspace it lives in: it lists conversations from every project plus those in none, newest activity first, each naming its project and workspace, six at a time with "Show more". The Projects heading carries the "+ folder" create action and therefore stays visible even when there are no projects or all of them are pinned. While searching, Recent only lists conversations outside projects, so a match appears once, in its tree. Session rows show the title and one status: a spinner while running, a blue dot when unread, otherwise a compact age ("5m", "3h"). Empty workspaces render no placeholder row; the compose button on the workspace row is the call to action. Project `…` opens the project page; long-press on a project or workspace opens its page. With no conversations and no projects, the empty state offers both "New conversation" and "New project".
- **New conversation.** A centered prompt with a workspace pill ("No project" or the workspace name) that opens the picker. The last workspace used on this device is preselected, and an explicit workspace from Home always wins. The composer is shared with conversations (see below).
- **Conversation.** The native header holds the title, Search and `…`. A connection banner appears only when not connected. The composer is `ComposerFrame`: input; then attach · access chip ("Auto" / "Full access", orange when full) · model chip ("gpt-5.3-codex · high") · send/stop. The context ring appears only at ≥75% usage; otherwise usage lives in the `…` sheet. Pending questions show one tappable strip above the composer.
- **Conversation `…` sheet** (`ConversationActions`): rename field with Save; a grouped list of Pin, Browse files, Notifications, Fork, Mark read/unread, and Resume (only when not live); a read-only Details group (state, context, directory, session ID); Archive last and separated, behind a confirmation.
- **Project / Workspace.** Grouped lists. A project lists its workspaces plus "New workspace", then Pin / Rename / Manage sources. A workspace lists Pin / Browse files / Manage, then its conversations, with a full-width primary "New conversation" button pinned at the bottom.
- **Settings.** Four groups in order of use: Device (current device → Devices, Files, Channels, Sync Codex), Models (profiles, favorites, runtime status), Conversation (send mode, translation; saved per device), General (language). A row and the screen it opens use the same words.
- **Devices.** One list: tap a device to switch to it (the current one has a check), the pencil opens its form, and "Add device" is the last row. The form has one primary action (Save), a neutral Test connection whose result shows inline, and, for an existing device, Remove at the bottom behind a confirmation.
- **Files.** A path bar (up button + current path) over a plain list of folders and files. Tapping the path opens "Go to path" for typing one; an empty path lists the registered roots. An opened file replaces the list; up returns to its folder.
- **Forms.** Page-sheet forms (device, new workspace, manage workspace, add workspace source) put the title and the single dismiss action on one row, the primary action full-width below the fields, and destructive actions last in their own group.
- **iPad (≥768pt).** A persistent sidebar shows the Home content, and the detail stack sits on the right. Opening the device switcher from a detail screen first returns to Home so unsaved-edit guards run.

Device switching unmounts the host-scoped navigation stack and aborts its network lifetime, so IDs from different daemons never share state. Name and token edits keep the logical host ID, while the connection instance is always recreated. Changing the origin adds a separate device.

## UI structure

- `theme.ts`: the only place for color, spacing, radius, and type tokens. Screens do not use literal hex values; message rendering keeps a few syntax colors.
- `components/ui.tsx`: primitives. `Action` (primary / default / secondary / danger, optional `block` and `icon`), `ListGroup` + `ListRow` (inset grouped list with automatic separators; a second control on a row, such as edit or remove, goes in `accessory` so it stays a separate touch target), `Chip` (labeled compact control), `EmptyState`, `Section` (title/footer), `TextField` (label/help), `IconButton`, `Notice`, `Loading`. New UI should be composed from these rather than from ad-hoc `View`/`Text` styling.
- `components/BottomSheet.tsx`: the one transient surface for pickers and short forms. Longer creation flows (new workspace, add device) use `Modal presentationStyle="pageSheet"`.
- `components/ComposerFrame.tsx`: shared composer frame and `PolicyChoices` for new and existing conversations.
- `features/catalog/`: one file per screen (`HomeScreen`, `ProjectScreen`, `WorkspaceScreen`, `SourcesScreens`), the shared `SourceOptions`, and the focus-bound load/mutation hooks.
- `screens/`: the remaining screens (conversation, new conversation, files, settings, devices, channels).

## Ownership and invariants

- `core/client.ts`: immutable connection, public endpoint methods, credential-bound origin, structured errors, cancellation and request timeout. No implicit mutation retry; bearer never goes into routes, URLs or external image/link requests.
- `core/hosts.ts`: serialized registry updates; metadata in AsyncStorage, credentials in device-only Keychain via SecureStore. Missing secret is an error, never an anonymous fallback.
- `core/timeline.ts`: durable items authoritative; cursor advances only for durable SSE items. Initial recent history then stream after max sequence. Backfill through current turn boundary recovers approvals outside recent page. Reconnect drops volatile previews, replays durable sequence, dedupes. Focus/AppState own stream lifetime.
- `platform/`: Expo streaming fetch and storage adapters. `screens/` and `features/`: navigation and user interaction; no Node or filesystem assumptions.
- Existing shared business rules reused without importing desktop renderer. Don't promote speculative shared application frameworks before there are real cross-platform callers.

## Performance

Native FlatList for catalog/transcript, stable item identities and memoized message rendering; live deltas publish at most once per 60ms. Bounded ephemeral previews, lazy image loads/tool expansion, collapsed reasoning, history paging. No all-project details fan-out or all-host background subscriptions. Backgrounded/unfocused conversations abort stream, refresh on resume. Manual file refresh, foreground staleness notices and revision-aware save keep drafts safe. Native scroll/keyboard/selection performance remains a device acceptance item, not something proven by Linux export.

## Catalog loading

Home uses one virtualized list grouped into pinned items, recent sessions, and projects. Recent is derived from the catalog response already loaded for the tree, so it adds no request. Project details, workspaces, and source management load on navigation rather than through an all-project fan-out. Reads reload on focus or explicit refresh; generation guards reject stale responses. Mutations use single-flight locks and do not retry automatically. Delayed mutation callbacks check route validity before navigating.

## Draft persistence

Composer state is scoped by logical host and session. A send attempt persists its payload and client message ID before submission. Retrying an uncertain result reuses both. State transitions update the cleanup reference before awaiting storage, and navigation removal is blocked while a mutation and its persistence are pending. This prevents an old screen from overwriting a newer draft for the same session.

Selected excerpts belong to that same draft and are serialized into quoted prompt text when creating an attempt. A translation is a separate, cancellable daemon request and never submits a conversation turn. Selection, image and diagram viewers retain snapshots at screen scope so virtualized message rows can unmount safely. Markdown node keys remain stable across appended deltas; native code highlighting and image frames do not remount on each stream update. History pagination requires a user gesture, while the native timeline renders from the latest end so initial positioning does not chase estimated historical row heights. Web keeps measured bottom corrections. Translation language and optional global API profile are stored per device in Settings; selecting Translate starts one cancellable request with those preferences.

## Validation boundaries

Behavior tests cover origin and credential isolation, cancellation, SSE fragmentation and replay, message retry identity, workspace-scoped profiles, and file conflict rules. Run mobile typecheck, tests, and iOS bundle export alongside root checks when shared code or workspace configuration changes. Native compilation and device behavior require separate iOS validation; a JavaScript export does not exercise UIKit, Keychain, or the native transport.
