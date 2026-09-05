# AGENTS.md

## Project

This repository contains the Zotigo Desktop and Web clients. Keep it small, reviewable, and safe to open source.

## Scope

Both clients manage a running `zotigod` daemon through public HTTP APIs only. Their current surface includes:

- `GET /health`
- `/agents` and `/agents/codex/prepare`
- `/config/profiles` and `/skills`
- `/projects`, `/sources/inspect`, and `/workspaces`
- `/catalog/sessions`
- `/sessions` and public session actions, items, events, approvals, images, and organization endpoints

Keep the exact contract aligned with `zotigo/docs/zotigod-api.md`. Do not call internal worker endpoints from the Electron UI, preload, or client code.

## Engineering Rules

- Use pnpm.
- Work on feature branches. Do not commit directly to `master`.
- For UI changes, first read `.codex/skills/zotigo-codex-design-system/SKILL.md` and follow it unless the user explicitly asks for a different direction.
- Keep renderer Node access disabled. Use preload to expose narrow, typed APIs.
- Keep zotigod HTTP calls in `backend/`, not scattered through React components. Desktop IPC and Web HTTP adapters call the same application service.
- Share React components across platforms. Native dialogs and OS integration belong in Electron; Web authentication and browser transport belong in the Web adapter.
- Prefer React local state until there is a concrete need for more state management.
- Avoid speculative abstractions, broad cleanup, auth, auto-update, code signing, daemon process management, real workers, browser-use, and computer-use unless explicitly requested.

## Checks

Run these before handing off meaningful code changes:

```bash
pnpm test
pnpm typecheck
pnpm build
```
