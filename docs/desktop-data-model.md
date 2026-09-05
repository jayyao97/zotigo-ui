# Zotigo Desktop Data Model

This document captures the first persistent data design for Zotigo Desktop. It separates local desktop product state from the running `zotigod` daemon state so the UI can evolve toward a Codex-like project and conversation model without expanding the public daemon API.

## Goals

- Persist projects, conversations, pinned order, selected state, and daemon session bindings locally.
- Keep `zotigod` as the source of truth for daemon session lifecycle state.
- Keep desktop-owned state in Electron main, behind preload IPC APIs.
- Avoid calling internal worker endpoints from desktop code.
- Keep the first implementation small: SQLite, no ORM, no worker/runtime/browser automation.

## Sources Of Truth

`zotigod` owns:

- daemon session id
- daemon session state
- daemon timestamps and daemon error
- public session lifecycle APIs

Zotigo Desktop owns:

- projects and project ordering
- conversations and pinned ordering
- selected project and selected conversation
- conversation title
- project-to-conversation grouping
- local conversation-to-daemon-session bindings
- daemon base URL preference

The renderer should consume a desktop view model assembled by Electron-owned code. It should not directly read/write SQLite or scatter local storage state across React components.

## Storage Choice

Use SQLite for local persistent desktop state.

Rationale:

- project and conversation search/sort should not require full-file JSON reads
- pinned order and project order are relational state
- daemon sessions need stable local bindings to conversations
- migrations are clearer than ad hoc JSON schema evolution
- SQLite is small enough for a desktop app and avoids introducing a heavier service

Implementation preference:

- Try the smallest viable SQLite binding for the Electron runtime.
- Keep access in Electron main only.
- Use a thin repository module rather than an ORM.
- Add migrations from the first schema version instead of relying on implicit table creation forever.

## Schema V1

```sql
create table schema_migrations (
  version integer primary key,
  applied_at text not null
);

create table projects (
  id text primary key,
  name text not null,
  path text,
  display_order integer,
  created_at text not null,
  updated_at text not null,
  last_opened_at text
);

create table conversations (
  id text primary key,
  project_id text references projects(id) on delete set null,
  title text not null,
  pinned_at text,
  pinned_order integer,
  created_at text not null,
  updated_at text not null,
  last_opened_at text,
  check (
    (pinned_at is null and pinned_order is null) or
    (pinned_at is not null and pinned_order is not null)
  )
);

create table daemon_session_bindings (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  daemon_base_url text not null,
  daemon_session_id text not null,
  state text,
  error text,
  daemon_created_at text,
  daemon_started_at text,
  daemon_ended_at text,
  created_at text not null,
  updated_at text not null,
  last_seen_at text,
  unique (daemon_base_url, daemon_session_id)
);

create table preferences (
  key text primary key,
  value_json text not null
);

create index idx_projects_order_created
  on projects(display_order, created_at desc);

create index idx_conversations_project_created
  on conversations(project_id, created_at desc);

create index idx_conversations_pinned_order
  on conversations(pinned_order)
  where pinned_at is not null;

create index idx_bindings_conversation
  on daemon_session_bindings(conversation_id);
```

## Ordering Rules

Projects:

```sql
select *
from projects
order by display_order is null, display_order asc, created_at desc;
```

Meaning:

- default projects have `display_order = null`
- default project order is newest first by `created_at desc`
- user-reordered projects get a `display_order`
- ordered projects appear before unordered projects

Pinned conversations:

```sql
select *
from conversations
where pinned_at is not null
order by pinned_order asc, pinned_at desc;
```

Project conversations:

```sql
select *
from conversations
where project_id = ?
order by created_at desc;
```

Use sparse integer order values for manual ordering, for example `1000`, `2000`, `3000`. Dragging one item usually updates one row. If gaps are exhausted, rebalance only the affected list.

## New Chat Flow

Default empty state should be a new chat page, not a session lifecycle dashboard.

1. User opens New chat.
2. User chooses a project context:
   - existing project
   - new project
   - use an existing folder
   - do not work in a project
3. Desktop creates a local conversation.
4. Desktop calls `POST /sessions` on the configured `zotigod`.
5. Desktop creates or updates a `daemon_session_bindings` row linking the local conversation to the daemon session.
6. UI selects the new conversation and shows the conversation timeline.

If `POST /sessions` fails after the local conversation is created, keep the conversation but mark it unbound. The user can retry session creation from that conversation.

The first implementation keeps this flow in Electron main as one product action. React asks for "create conversation with session"; Electron creates the local conversation, calls the public daemon API, and writes the binding when the daemon call succeeds.

## Conversation Titles

Desktop stores an immediate provisional title derived from the first prompt.
After the first turn completes successfully, the renderer may request the
Electron main process to generate a better title through
`POST /sessions/{id}/title-suggestion`.

Zotigod returns only a suggestion; `conversations.title` remains the durable
source of truth. Electron recovers the first user message through the paginated
display log, derives the expected provisional title with the same helper used
at creation, and applies the suggestion with a compare-and-set update. It also
invalidates an in-flight request whenever the user renames the conversation, so
manual edits win even if the title changes away from and back to the provisional
string. Title failures keep the provisional value and do not become chat errors.

Electron coalesces concurrent requests and attempts generation at most once per
conversation during a process lifetime. No title-source column or schema
migration is needed for the first version.

## Existing Daemon Sessions

`GET /sessions` may return sessions that do not exist in local desktop storage.

Do not automatically pretend those sessions belong to a project. Treat them as unbound daemon sessions and allow a later binding flow:

- bind to an existing conversation
- create a new conversation under a project
- leave unbound

This keeps imported daemon state distinct from local product state.

## IPC Boundary

Renderer-facing APIs should be narrow and typed. Proposed preload surface:

```ts
interface ZotigoDesktopStateApi {
  getDesktopState(): Promise<DesktopState>;
  createProject(input: CreateProjectInput): Promise<DesktopState>;
  updateProjectOrder(input: UpdateProjectOrderInput): Promise<DesktopState>;
  createConversation(input: CreateConversationInput): Promise<DesktopState>;
  pinConversation(input: PinConversationInput): Promise<DesktopState>;
  updatePinnedConversationOrder(input: UpdatePinnedConversationOrderInput): Promise<DesktopState>;
  selectProject(id: string | null): Promise<DesktopState>;
  selectConversation(id: string | null): Promise<DesktopState>;
}
```

`zotigod` HTTP calls should remain in Electron-owned code. Renderer should request product actions, not compose daemon calls and SQLite writes itself.

## Preferences

Initial preference keys:

- `daemonBaseUrl`
- `selectedProjectId`
- `selectedConversationId`

Store preference values as JSON so booleans, strings, and future structured values can share one table without schema churn.

## Transcript Boundary

Desktop should not create the authoritative transcript/event log. Zotigo/zotigod should own that log because CLI and daemon sessions can exist without the desktop app. Desktop may later add a local message cache for fast rendering and offline previews, but that cache must be repairable from public zotigod APIs.

`AgentSnapshot.History` is runtime/model context and may be compacted. It should not be used as the source of truth for desktop conversation history.

## Open Decisions

- Whether `node:sqlite` remains sufficient for Electron development and packaging.
- Whether project `path` is required for local projects or can remain nullable for imported/manual projects. V1 allows nullable paths for manually created projects.
- Whether daemon session cache should grow into a separate table after zotigod exposes a display event/message API. The v1 schema caches only session lifecycle fields for offline display; live daemon state should win when available.
