# Contributing

Use the Node and pnpm versions in the README. Run `pnpm install --frozen-lockfile`, work on a feature branch, and keep changes focused on one behavior or module boundary.

Put reusable interaction logic in the shared React client and application behavior in `backend/`. Use the platform adapters only for transport, authentication and genuinely native operations. Keep daemon calls on public APIs and preserve renderer isolation. Do not duplicate a feature into a separate Web UI when the existing component can serve both clients.

Before submitting a change, run:

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Add behavior-focused regression coverage for bugs. Transport changes need both IPC and JSON semantics considered; event streams need disconnect, reconnect and concurrent-client coverage. UI changes need real interaction checks, not only screenshots or builds. Test against disposable projects and report which platforms and scenarios were actually exercised.

Do not commit credentials, local preferences, logs, conversation exports, personal machine paths, generated builds or extracted third-party app assets. Check the ownership and licensing of new dependencies and assets before including them. Do not copy proprietary font files or source code to reproduce a visual style.

After production dependency changes, regenerate `THIRD_PARTY_NOTICES.md` with `node scripts/third-party-notices.mjs > THIRD_PARTY_NOTICES.md` and review its contents. CI checks that it matches installed dependencies. The generator collects root license/notice files; it does not replace checking packages for embedded third-party code or license terms in other locations.

In the change description, state the user-visible behavior, verification evidence, native-only differences, remaining limitations and rollback implications. A green unit-test run must not be described as complete E2E coverage.
