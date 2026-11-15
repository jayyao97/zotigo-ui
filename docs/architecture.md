# Architecture

This document explains how the Desktop and Web clients are put together and
why each layer exists. `README.md` covers what the product does; `AGENTS.md`
covers working rules. Read this before moving code between directories.

## One sentence

Both clients are thin front ends for a running `zotigod` daemon. The React UI
never talks to the daemon; it calls typed operations, and one application
service turns each operation into public daemon HTTP calls.

## Processes

```
Desktop                                   Web
┌────────────────────┐                    ┌────────────────────┐
│ renderer (src/)    │                    │ browser (src/)     │
│  window.zotigo     │                    │  src/web/api.ts    │
└───────┬────────────┘                    └───────┬────────────┘
        │ IPC: invoke(channel, args)              │ HTTP: POST /api/rpc {channel, args}
┌───────▼────────────┐                    ┌───────▼────────────┐
│ electron/ main     │                    │ web/ server        │
│  preload, dialogs  │                    │  token auth, SSE   │
└───────┬────────────┘                    └───────┬────────────┘
        └──────────────┬──────────────────────────┘
               ┌───────▼─────────────────┐
               │ backend/                │
               │  applicationService     │  one operation table for both clients
               │  catalogService, hosts  │
               │  daemon/ (HTTP + SSE)   │
               └───────┬─────────────────┘
                       │ public HTTP API (zotigo/docs/zotigod-api.md)
               ┌───────▼─────────┐
               │ zotigod         │  local, or a remote host
               └─────────────────┘
```

The renderer runs with Node access disabled. Everything it can do is an
operation name (`desktop:*`, `sessions:*`, `files:*`, ...) plus JSON arguments.
That single narrow seam is what lets the same UI run in Electron and in a
browser.

## Layers

| Directory | What it is | Why it is a separate layer |
| --- | --- | --- |
| `shared/` | Daemon DTOs, the typed client API (`clientTypes.ts`, `clientApi.ts`), i18n catalogs, and pure helpers (display merging, paging, ordering). No Node, no DOM, no React. | It is the contract between UI and backend, and the only code both sides may import. Keeping it pure is what makes the helpers unit-testable without a window or a daemon. |
| `backend/` | The application service (operation table), input validation, catalog mapping, host selection, local file access, and the daemon client under `backend/daemon/`. Runs in Node. | Daemon credentials, host routing and file authorization must not live in the renderer. Having one service means Desktop and Web cannot drift apart operation by operation. |
| `electron/` | Main process: window, preload bridge, native dialogs, local daemon management, diagnostics. | Only code that needs Electron or the OS. It adapts IPC to the application service and adds what a browser cannot do. |
| `web/` | Node HTTP server: access token, origin checks, `/api/rpc`, SSE relay, static assets. | The Web adapter for the same application service. Authentication and browser transport are Web-only concerns. |
| `src/` | The React UI. `src/web/` holds the browser shell and its transport. | Presentation and interaction state only. It depends on `shared/` and nothing else. |

### Dependency rule

```
shared   ←  backend  ←  electron
   ↑           ↑
  src         web
```

A layer may import itself and the layers its arrow points to; nothing else.
`tests/layering.test.ts` enforces this on every `pnpm test`. The rule that
matters most is `src → shared` only: a renderer file importing `backend/` or
`electron/` would pull Node code into the browser bundle and bypass the
operation seam.

### Inside `backend/`

- `applicationService.ts` registers every operation with `handle(channel, fn)`.
  It is deliberately one table: to see what a client can do, read this file.
- `applicationInput.ts` validates operation arguments. They arrive as
  `unknown` from IPC or HTTP; nothing past this file handles unvalidated input.
- `catalogService.ts` maps daemon catalog data (projects, workspaces, sessions,
  navigation order) to the `DesktopState` the UI renders.
- `daemon/` is the daemon client, split by API area: `http` (base URL, errors,
  request helper), `validation` and `*Parsers` (responses are parsed into typed
  values; the few that are still cast are listed under Known debt), `sessions`, `eventStream`, `catalog`, `channels`, `hostServices`.
  `backend/zotigod.ts` re-exports its public functions so callers have one
  import.
- `hosts.ts` binds each request to an immutable host context. There is no
  process-global "selected host".

### Inside `src/`

Feature folders exist where a feature has grown several files:
`conversation/` (timeline, composer, tools, annotations), `sidebar/`,
`project/`, `workspace/`, `inspector/`, `channels/`, `web/`, and `app/` for
types and helpers shared by the pieces extracted from `App.tsx`. Older files
are still flat. `App.tsx` is the composition root and is far too
large; see Known debt.

State is React local state plus a few small modules that persist a single
preference each (`composerDrafts`, `lastModelSelection`, `unreadSessions`, ...).
There is no global store, by choice.

## Contracts that must stay compatible

- Operation names (IPC channels and `/api/rpc` `channel` values) and their
  argument shapes, between a renderer and the backend it shipped with.
- The daemon's public HTTP API. Never call `/internal/*`.
- `localStorage` / `sessionStorage` keys and the preferences file format.
- `update.json`, `daemon-version`, and the installer's file layout.
- Legacy fallbacks in parsers (older daemon field names) stay until the pinned
  daemon version no longer needs them.

## Tests

`pnpm test` compiles `tests/` with `tsc` and runs them with `node --test`.
Tests exercise `shared/` helpers and `backend/` services directly, and render
components with jsdom where behavior depends on the DOM. Two tests read source
on purpose because they are lint rules, not behavior tests: the layering check
above and the i18n check that UI copy goes through catalog keys.

Tests that regex-match source text or re-implement the logic they claim to test
do not belong here.

## Known debt

- `src/App.tsx` is still about 4,000 lines (it was 5,600). Dialogs, menus,
  inspector lists, the utility rail and the title were extracted as stateless
  components, and the self-contained state clusters as hooks (rename dialogs,
  workspace/project lifecycle dialogs, project source drafts, create-workspace
  drafts and the workspace-sources panel, conversation title editing, sidebar
  disclosure, channels navigation, sidebar sort order, search shortcut). What
  remains is the part that is genuinely one state machine today, roughly:
  - session event stream, delta flushing and history backfill (~450 lines)
  - send / steer / queue / submit and conversation creation (~450)
  - catalog bootstrap, polling, reconciliation and Codex sync (~340)
  - composer drafts, skills and attachments (~300)
  - side panel, file open and scroll effects (~350)
  - host volatile-state save/restore, session paging, unread tracking (~250)
  - model / profile / approval-policy selection (~150, not yet examined)
  - archive session, pin, fork, `confirmAddSources` (~120)
  - JSX: the two sidebar render functions, the conversation body, the side
    panel and dialog call sites (~1,200)
  These clusters share effects whose order matters. Two were untangled without
  reordering anything, and show the two safe techniques: the selection-change
  effect was split into two adjacent effects with the same dependency array
  (the title reset is independent of the rest), and the catalog bootstrap
  effect now calls `loadSidebarDisclosure` returned by the hook instead of
  being split (it is async). Values a hook needs that `App` declares later are
  passed as hoisted function declarations (`expandProject`, `isHostSwitching`).
  Rules that held for every extraction so far, and should keep holding: a hook
  is called where its first hook was; effects keep their relative order; a
  split effect keeps the full dependency array in both halves; nothing is
  memoised or un-memoised in the same change.
- `shared/sessionDisplay.ts` `optimisticSteeringDisplayItem` is used only by
  tests, as a fixture for ordering tests. Either the renderer should use it or
  the tests should build that item directly.
- `requestJSON` reports the module-level base URL in its non-JSON error message
  even when a remote host handled the request.
- `openDaemonFile`, `saveDaemonFile`, `previewDaemonImage` and
  `listDaemonDirectory` cast daemon responses instead of parsing them like the
  rest of the client.
- `src/styles.css` is a single file. Splitting it has no payoff until
  components own their styles.
