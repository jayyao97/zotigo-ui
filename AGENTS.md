# AGENTS.md

## Project

This repository contains the Zotigo Desktop and Web clients. Keep it small, reviewable, and safe to open source.

## Scope

Both clients manage a running `zotigod` daemon through public HTTP APIs only. Their current surface includes:

- `GET /health`
- `/agents` and `/agents/codex/prepare`
- `/config/profiles` and `/skills`
- `/projects`, `/sources/inspect`, `/sources/directories`, and `/workspaces`
- `/files/capabilities`, `/files/open`, `/files/save`, and `/files/list` for remote workspace text files
- `/catalog/sessions`
- `/sessions` and public session actions, items, events, approvals, images, and organization endpoints

Keep the exact contract aligned with `zotigo/docs/zotigod-api.md`. Do not call internal worker endpoints from the Electron UI, preload, or client code.

## Engineering Rules

- Use pnpm.
- Work on feature branches. Do not commit directly to `master`.
- For UI changes, first read `.codex/skills/zotigo-codex-design-system/SKILL.md` and follow it unless the user explicitly asks for a different direction.
- Keep renderer Node access disabled. Use preload to expose narrow, typed APIs.
- Bind daemon requests and long-lived subscriptions to an immutable host context; never use a process-global selected host. Keep credentials in the backend and scope preferences by host.
- Keep zotigod HTTP calls in `backend/`, not scattered through React components. Desktop IPC and Web HTTP adapters call the same application service.
- Share React components across platforms. Folder picking uses `DirectoryBrowser` and the selected daemon, including Local. Other OS integration belongs in Electron; Web authentication and browser transport belong in the Web adapter.
- Prefer React local state until there is a concrete need for more state management.
- Avoid speculative abstractions, broad cleanup, auth, auto-update, code signing, daemon process management, real workers, browser-use, and computer-use unless explicitly requested.

## Checks

Run these before handing off meaningful code changes:

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Source distribution

- `install.sh` installs Desktop/Web plus the `daemon-version` pinned daemon using that revision's installer helpers. Keep the pin aligned with the daemon PR/release; local testing may use `--daemon-source`.
- `pnpm build:web` skips the preload build; `pnpm package:desktop` stages only runtime outputs and notices. Node.js 22.12+ is required; the source installer reuses a suitable local runtime or provisions the pinned private runtime.
- Default installation selects the highest stable `vX.Y.Z` tag. The paired daemon owns `scripts/toolchains.sh` and the pinned official download manifest; do not introduce a second toolchain manager.
- Installer smoke tests must use an isolated prefix and HOME, and must not replace a developer's running services.
