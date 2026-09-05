# Project / Workspace / Session v2 Implementation Plan

> Review gate: implementation must not start until a subagent review reports no findings.

## 1. Product behavior

### Project

- A Project is a long-lived container with a visible `home_path`.
- The default home is `~/Zotigo/<sanitized-project-name>` and can be changed before creation.
- Project Homes are unique by normalized canonical path. The allocator first tries the
  readable slug and then appends a stable short Project-id suffix when the path is
  already reserved, contains unrelated user data, or belongs to another Project.
- Zotigo writes a small ownership marker containing the Project id before treating an
  existing directory as managed. It reuses an existing Home only when that marker
  identifies the same Project. It never derives a migrated Home from legacy
  `projects.path`, which was a Source path.
- Project creation transactionally reserves its id, normalized Home identity, and
  Sources with `status='initializing'`. It then creates/verifies the Home marker,
  `knowledge/`, and `workspaces/`, and marks the Project `ready`. Startup resumes
  `initializing` Projects and exposes failures as `error`, never as ready. A marker
  without a matching reservation is treated as a conflict, not adopted or deleted.
- Creation permits zero or more Sources.
- Git Sources and plain-folder Sources are registered separately but projected as one UI list.
- Project Home contains `knowledge/` and `workspaces/`; user-facing files never default to `~/.zotigo`.
- An existing v2 Project remains readable. Startup assigns a visible home if it has none, but does not move its source checkout or existing Workspace.

### Source

- Existing `project_repositories` remains the Git Source table so existing checkout foreign keys remain valid.
- A new additive `project_folders` table stores plain folders.
- Git Source registration probes canonical repository root, common dir, remote, and default base.
- Git identity is the canonical `git_common_dir`. Duplicate Git registrations within
  one Project are rejected even when selected through a subdirectory, symlink alias,
  or linked worktree.
- Plain folder registration stores canonical path and availability.
- Duplicate canonical plain-folder registrations within one Project are rejected,
  including symlink aliases.
- A Project may have zero, one, or many Git and plain Sources.
- Removing a Git Source is rejected while a Workspace checkout references it.
- Removing a plain Source is rejected while a Workspace folder binding references it.
- One Git Source may be marked primary, but primary is optional when no Git Source exists.

### Workspace

- A Workspace owns a visible root under `<project-home>/workspaces/<workspace-id>`; its title is display metadata rather than filesystem identity.
- It always creates `code/`, `artifacts/`, and `notes/`.
- The Workspace root, not `code/`, is the Session cwd.
- It can be created with zero or more selected Sources.
- Before persistence, the main process canonicalizes every existing path and validates
  the whole topology: the Workspace root must be inside its registered Project Home;
  the Home and Workspace must not be inside a Source; a Source must not be inside the
  target Workspace; no selected target keys may collide; and symlink aliases must not
  create an ancestor cycle. If the requested Project location is itself a Git repository,
  the UI offers to register that directory as a Source while allocating a separate Home.
- Every selected Git Source creates one locked linked worktree at `code/<source-key>`.
- All selected Git refs and branch names are validated before durable provisioning begins.
- Every selected plain Source requires an explicit mode:
  - `direct`: create a symlink at `code/<source-key>` pointing to the canonical original directory. No files are copied. The binding snapshots the canonical Source path and a database partial unique index permits one direct Workspace binding for that canonical path across all Projects.
  - `reference`: copy a snapshot into `notes/<source-key>`. The source remains unchanged. The UI describes this as a snapshot, not a live mirror or sandbox.
  - `copy`: copy an independent snapshot into `code/<source-key>`. The source remains unchanged.
- Copy operations preserve symlinks and never follow them outside the selected tree.
- Existing v2 Workspaces keep their current checkout paths. For a recognized managed
  `.../<workspace>/code` layout, `root_path` becomes `dirname(code_path)` and startup
  repair creates missing sibling `artifacts/` and `notes/` directories. A malformed
  legacy path keeps `root_path=NULL`, sets the existing `status='error'`, and stores the
  stable `error='legacy_path_error: unrecognized code_path layout'`. Its history remains
  readable, Retry reports the same non-destructive conflict, and it is never silently
  treated as a valid new Workspace root.
- Workspace scaffold reconciliation is a durable prerequisite owned by the Workspace
  record, not a Source binding. While `status='provisioning'`, repair verifies the
  Project Home marker, creates/verifies a Workspace ownership marker and its root,
  `code/`, `artifacts/`, and `notes/`, then reconciles bindings. This also makes an empty
  Workspace crash-repairable. The Workspace becomes `ready` only after the scaffold
  and all bindings are ready.
- Multi-Source provisioning uses a durable per-binding state machine:
  1. validate every Source, ref, branch, canonical path, and deterministic target;
  2. transactionally insert the Workspace and all checkout/folder bindings as `planned`;
  3. provision each target and persist that binding as `ready` or `error`;
  4. mark the Workspace `ready` only after every binding is `ready`.
- Git repair reconciles every planned checkout independently. Snapshot copies write to
  Zotigo-owned staging paths carrying a Workspace/binding marker and atomically rename
  only after a complete copy. Repair may remove only marked staging paths, never a
  conflicting final path. Direct repair verifies both that the target is a symlink and
  that its canonical destination matches the registered Source.
- Provisioning and startup repair remain idempotent. A final-path conflict is marked
  `error`; Zotigo never force-removes or overwrites a path.

### Session

- A Workspace Session stores `project_id` and `workspace_id`; its runtime cwd is `workspace.root_path`.
- A Scratch Session stores neither Project nor Workspace and owns a visible `scratch_path` under `~/Zotigo/Scratch/<conversation-id>`.
- A Conversation with `workspace_id IS NULL AND scratch_path IS NULL` is explicitly a
  legacy Previous Session. `project_id` may remain populated only as historical/display
  metadata. Migration never assigns it a cwd, whether or not it has a daemon binding or
  history. It can only be continued into a newly created Scratch or Workspace successor.
- A new Scratch Session is identified by non-null `scratch_path`. A Workspace Session
  requires both `workspace_id` and the matching `project_id`; every other combination
  is invalid for new records.
- New Scratch creation allocates and persists its directory before a backend runtime is
  created. Failure leaves no backend bound to an undefined cwd.
- Global New Session starts with no context selected. The user chooses an existing Workspace or Scratch.
- Workspace `+` preselects that Workspace and goes directly to the composer.
- Project/Workspace creation is not embedded in New Session.
- Composer and inspector continuously display the chosen context.

### Previous Session continuation

- A started/history Session is never rebound to another cwd.
- `Continue in workspace…` creates a new Desktop Conversation under the selected Workspace and records `continued_from_conversation_id`.
- The original Session and backend binding remain unchanged.
- The successor starts a new backend runtime in the Workspace when the user sends the next prompt.
- v2 does not synthesize a model summary or copy the full transcript. The successor UI links to the source Session and asks the user for the next instruction.

## 2. Additive persistence changes

Create schema migration v3:

- `projects.home_path text` and `projects.normalized_home_path text` (nullable during
  migration, populated by startup repair), plus `status` and `error` for the repairable
  initializing/ready/error lifecycle.
- `workspaces.root_path text` (nullable during migration, backfilled from existing `code_path`).
- `conversations.scratch_path text`.
- `conversations.continued_from_conversation_id text references conversations(id) on delete set null`.
- New `project_folders` table:
  - id, project_id, source_key, name, source_path, availability, last_probed_at, timestamps.
- New `workspace_folders` table:
  - id, workspace_id, folder_id, mode, direct_source_path, target_path, status, error, timestamps.
- Project Home ownership marker stores the Project id inside the Home; the database is
  authoritative and the marker only prevents accidental directory adoption.
- Unique `(project_id, source_key)` for plain Sources.
- Unique `(project_id, source_path)` for canonical plain Sources.
- Unique normalized `projects.normalized_home_path` when non-null.
- Unique normalized `(project_id, project_repositories.git_common_dir)`.
- Unique `(workspace_id, folder_id)` for bindings.
- Partial unique index on normalized `workspace_folders(direct_source_path) where mode = 'direct'`.

Migration rules:

- Before v3 migration, close/flush the SQLite connection and create a verified,
  timestamped SQLite backup beside the database using SQLite's backup mechanism. Keep
  the newest three migration backups and document the restore filename in logs.
- The v3 migration transaction queries legacy Workspace rows, recognizes the exact
  managed `.../<workspace>/code` shape in Node, computes parents with `path.dirname`,
  and performs parameterized updates. Unrecognized rows receive the stable error state
  above. This is still database-only; it does not touch the filesystem.
- Startup repair creates missing visible Project Home folders and refreshes Source availability.
- Existing conversations, bindings, pins, titles, and checkout records remain intact.
- Existing Workspaces are not relocated.
- Downgrade remains unsupported after v3 data is created; rollback uses the verified
  pre-migration backup. A failed migration must leave the original database usable.

## 3. Main/preload API boundaries

Add narrow typed APIs:

- `chooseProjectHome()` and `chooseSourceFolders()`. Source selection and probing are
  main-owned; the chooser returns display-only candidates:
  ```ts
  type SourceCandidate =
    | {
        kind: 'git'
        selectedPath: string
        canonicalPath: string
        name: string
        gitCommonDir: string
        defaultBaseRef: string
      }
    | {
        kind: 'folder'
        selectedPath: string
        canonicalPath: string
        name: string
      }
  ```
- `createProject({ name, homePath, sourcePaths[] })` and
  `addProjectSources(projectId, sourcePaths[])` accept only the originally selected
  paths. Electron main re-probes, canonicalizes, classifies, and validates every path at
  submission time; it never trusts candidate kind or metadata round-tripped through the
  renderer. A disappeared or changed Source produces a validation error before durable
  Project/Source creation.
- `removeProjectSource(sourceKind, sourceId)`.
- `setPrimaryRepository(projectId, repositoryId | null)`.
- `createWorkspace({ projectId, title, rootPath, repositories, folders })`, where:
  - `repositories: Array<{ repositoryId, baseRef, expectedBaseCommit, branchName }>`
  - `folders: Array<{ folderId, mode: 'direct' | 'reference' | 'copy' }>`
  - the main process verifies Project ownership, availability, unique target keys, ref
    freshness, expected commits, and branch validity for every item before persistence.
    Target keys are derived exclusively from collision-safe keys persisted on Source
    records; the renderer cannot supply or rename them in v3.
- `continueConversationInWorkspace(conversationId, workspaceId)`.
- `revealPath(path)` with validation that the path belongs to a registered Project Home, Workspace, Scratch directory, or Source.

Renderer never invokes Git or filesystem APIs directly.

## 4. UI changes

- Keep the existing Zotigo shell, tokens, sidebar material, conversation surface, and floating inspector.
- Sidebar permanently exposes Project `+`, Workspace `+`, and `New workspace`.
- Legacy conversations are grouped under `Previous sessions`.
- Previous Session menu offers `Continue in workspace…`, Rename, and Pin.
- Global New Session first shows a grouped Workspace chooser plus Scratch; no context is preselected.
- Create Project modal collects name, visible Project Home, and optional Sources.
- Project overview exposes Home, knowledge, Sources, Workspaces, and Finder actions.
- Create Workspace modal selects zero or more Sources and uses collapsed Git/location advanced options.
- Plain folder mode dialog requires an explicit selection; no default radio option.
- Error Workspace exposes Retry but no destructive cleanup.

## 5. Validation and tests

Focused tests:

- v2-to-v3 migration preserves legacy Project, Workspace, Conversation, binding, pin, and selection state.
- Migration sets recognized legacy Workspace cwd to the parent of `code/`, creates
  sibling artifact/note directories on repair, and flags malformed layouts.
- Duplicate Project names, pre-existing unrelated Home directories, marker mismatch,
  and restart idempotence preserve unique ownership.
- Project creation crash before and after marker creation resumes safely and never
  exposes an unverified Home as ready.
- Empty Project and empty Workspace creation.
- Empty Workspace creation recovers after an injected crash immediately after its
  database reservation and creates the full scaffold on restart.
- Multi-Git Workspace creates one worktree per repository and leaves all source checkouts unchanged.
- Plain direct/reference/copy behavior uses temporary directories and verifies original files are not unexpectedly modified.
- Direct mode uniqueness is enforced.
- Direct uniqueness covers duplicate registration, symlink aliases, and cross-Project bindings.
- Scratch Session creates a visible isolated cwd and no Project/Workspace binding.
- Two Sessions in one Workspace resolve the same root cwd without creating another checkout.
- Continue in Workspace creates a successor relation and preserves the original binding/cwd.
- Invalid/moved refs and path conflicts fail without overwriting data.
- Home/Source/Workspace ancestor overlap, recursive copy, symlink-alias cycles, and
  duplicate target-key validation fail before durable provisioning.
- Injected failure after the first Source and mid-copy is recoverable on startup; only
  marked staging paths may be cleaned.
- Bound and unbound legacy Conversations remain legacy across migration/restart and are
  never assigned a new cwd.
- Project-bound legacy Conversations, both bound and unbound to a daemon, remain in
  Previous sessions and cannot start with new Workspace/Scratch cwd semantics.
- Git duplicate registration is rejected for root/subdirectory selection, symlink
  aliases, and linked worktrees sharing one canonical common dir.
- Mixed Git/plain Source discovery is main-owned; a Git subdirectory is classified as
  its repository, and disappeared/changed paths plus symlink aliases are revalidated on
  Project submission.
- Migration failure leaves the original SQLite database usable and a verified backup exists.
- Startup repair is idempotent.

Final checks:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Non-destructive manual E2E:

- Use temporary Git repositories and temporary plain folders for provisioning tests.
- Use the real `zotigo-desktop` repository only as a read-only Source probe; do not create branches or worktrees in it during automated tests.
- Launch Desktop against a local zotigod.
- Create one Scratch Session and send one short prompt such as `Reply only: OK` using the cheapest configured profile, then stop. No more than one LLM turn is required.

## 6. Explicit non-goals

- No Project/Workspace deletion or automated branch deletion.
- No source cloning from remote URLs.
- No automatic dependency installation or port allocation.
- No model-generated title, plan, checkpoint, or handoff summary.
- No full Codex write integration.
- No security claim for worktrees, copied folders, symlinks, or Scratch directories.
