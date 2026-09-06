# Zotigo Desktop and Web

Electron and browser clients for managing `zotigod` sessions, using the same React interface and application services.

## Scope

Both clients provide a UI for zotigod:

- Manage Projects, Sources, and Workspaces through public catalog APIs.
- Create and organize Zotigo or Codex sessions.
- Stream session events with polling fallback and render tools, approvals, Markdown, and images.
- Open and safely edit text files rooted in registered Sources and Workspaces.
- Desktop development can build and launch a local `zotigod` when one is not already available. Web requires a separately running daemon. Saved remote hosts are supported by both clients.

The renderer never calls zotigod directly and does not use internal worker endpoints. Desktop uses a narrow preload API; Web uses authenticated, same-origin HTTP and event streams. Source installation and Desktop packaging are described in [installation](docs/installation.md). Auto-update, Developer ID signing and notarization are not configured. Critical Desktop and Web flows have been exercised locally end to end; this is not a production security certification or a guarantee for every deployment.

### Daemon recovery dependency

Client validation exposed a daemon recovery bug that can replay an already executed message after an unacknowledged command. The fix is tracked in [Zotigo #77](https://github.com/jayyao97/zotigo/pull/77), commit `bb1841a3829a1dc683b4653dd0b814c4ec10d77b`. Deploy a daemon version containing that fix to address this recovery case. Building these clients does not upgrade a separately running daemon; the client snapshot does not include the core fix.

## Shared client architecture

| Directory | Responsibility |
| --- | --- |
| `src/` | Shared React UI, conversation rendering, editor, image viewer and interaction state |
| `shared/` | Daemon DTOs, client types, typed operation mapping and pure helpers |
| `backend/` | Public daemon API client, application operations, authorized local files and catalog mapping |
| `electron/` | Native window, preload/IPC, native dialogs and OS integration |
| `web/`, `src/web/` | Web server authentication, HTTP/SSE transport, login and server-path selection |

Desktop and Web share catalog data through zotigod. Browser selection is scoped to a tab and survives reload when session storage is available. It does not change Desktop's selected conversation. Both clients use the same daemon-backed directory browser for choosing project sources and opening workspace files. Browser image downloads use the authenticated image endpoint.

## Search and remote hosts

Click the sidebar search icon or press **Cmd+K** (macOS) / **Ctrl+K** to search recent sessions by title, project or workspace. Use the arrow keys and Enter to open a result, or Escape to close. The palette searches the currently selected host and includes shortcuts for creating sessions and projects.

Open the host menu at the top left, then **Host settings**. Add a name, daemon origin (for example `http://dev:8766`) and its daemon token, then **Test**. Select the saved host from the same menu. The address is the daemon's reachable address, not `0.0.0.0` or the Web UI URL. Remote daemons must include the directory-browsing and `/files/capabilities` APIs from the paired daemon revision; an older daemon produces an upgrade message.

Projects, source inspection, workspace creation, sessions, events, images and text-file editing use the selected daemon. When adding project folders, browse the selected daemon’s directories using the shared picker: enter a directory, return to its parent, select several folders, or use the current folder. This also applies to Local and Desktop; no native folder dialog is used. Remote files have the same text-editor limits: preview up to 5 MiB, edit up to 1 MiB, and reject saves after an external modification. Use **Files**, project source paths, workspace **Browse files**, or Artifacts/Notes to browse registered roots and open text files in the editor. Directory links in Markdown open this browser too; binary files remain unsupported in the text editor. Directory reads are bounded at 1,000 entries with a visible truncation notice; use the path field to reach deeper directories. Listings are refreshed on navigation or manually, not watched in the background. Switching checks the connection, asks before discarding drafts/unsaved edits, and clears the previous host's view. It does not stop work already running on either daemon.

Desktop remembers its host on that device; Web remembers it per browser tab. Conversation selection and ordering are separated by host. Saved profiles are shared by authenticated users of the same Web backend, but switching one tab does not switch another. Profiles and daemon tokens live in an owner-only `hosts.json` beside backend preferences (Web: `ZOTIGO_WEB_DATA_DIR`, default `~/.zotigo/web`; Desktop: Electron's user-data directory). Profile-list responses never return the token. To change an endpoint or credential, add a replacement profile, switch to it, and remove the old one. The built-in Local profile continues to use the startup environment.

The browser connects to its Web backend; that backend connects to the selected daemon. Desktop connects through its main process. Both use HTTP(S) with Bearer authentication; no SSH credentials or tunnel manager are involved. Use HTTPS for connections outside a trusted network. Plain HTTP does not encrypt the daemon token. Web login and daemon authentication remain separate.

Existing preferences need no migration. A rollback ignores the additional host-selection fields and leaves `hosts.json` in place; older clients cannot use saved remote profiles. Upgrade the daemon before selecting it in the new UI. Separately managed daemons are not upgraded by saving or testing a host.

## Development

Use Node.js 22.12 or newer and pnpm 10.30.3 (the version declared in `package.json`). Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Run the desktop app in development:

```bash
pnpm dev
```

To run the built renderer without Vite:

```bash
pnpm build
pnpm start:desktop
```

This uses the same `file://` renderer loading path as a packaged application. It is not an installer or a code-signed release.

The renderer dev server runs at:

```text
http://127.0.0.1:5173
```

By default the app connects to:

```text
http://127.0.0.1:8766
```

You can override the initial daemon URL with:

```bash
ZOTIGOD_URL=http://127.0.0.1:8766 pnpm dev
```

For isolated UI testing when port 5173 is occupied, start Vite on another loopback port and set `ZOTIGO_DESKTOP_DEV_SERVER_URL` for the Electron process. Remote origins are rejected because the renderer receives the privileged preload API.

Set `ZOTIGO_DESKTOP_MANAGE_DAEMON=0` to require an already running daemon. If using the development daemon builder, `ZOTIGOD_WORKDIR` identifies the Zotigo core source checkout; a Go toolchain is required to build it.

## Run Web locally

Start zotigod on the same machine first, then:

```bash
pnpm build
pnpm start:web
```

Open the URL printed by the server (default `http://127.0.0.1:8080`) and enter the generated access token from `~/.zotigo/web/access-token` (or `ZOTIGO_WEB_DATA_DIR/access-token`). The token is stored in an owner-only file, not printed to logs, and changes on restart. A successful login creates an HttpOnly, SameSite=Strict cookie that expires after 12 hours. Logout revokes that browser session; server restart invalidates all browser sessions.

| Environment variable | Default / purpose |
| --- | --- |
| `ZOTIGOD_URL` | `http://127.0.0.1:8766`; initial Local host (Web requires this initial endpoint to be loopback) |
| `ZOTIGO_WEB_HOST` | `127.0.0.1` |
| `ZOTIGO_WEB_PORT` | `8080` |
| `ZOTIGO_WEB_ORIGIN` | `http://127.0.0.1:<port>`; exact browser origin, without a path |
| `ZOTIGO_WEB_TOKEN` | Random on startup; an explicit token must contain at least 24 characters |
| `ZOTIGO_WEB_DATA_DIR` | `~/.zotigo/web`; Web preferences, separate from Desktop preferences |

Keep tokens out of source files, shell history, screenshots and shared logs. A token grants access to the entire configured workspace service, not a restricted project or account. See [security and deployment boundaries](SECURITY.md) before allowing access from another machine.

### Remote access

Use an HTTPS reverse proxy with authentication at the Web application and a network boundary appropriate to your environment. Set `ZOTIGO_WEB_ORIGIN` to the browser's HTTPS origin. Forward the matching `Host` header, disable response buffering for `/api/events`, allow long-lived event connections, and configure request limits to accommodate image uploads (up to 30 MiB JSON). Keep the Web backend port and zotigod inaccessible to untrusted networks; TLS must terminate before credentials cross the network.

Setting a non-loopback Web bind address requires an explicit origin. HTTPS is the default requirement; trusted LAN deployments can explicitly set `ZOTIGO_WEB_ALLOW_HTTP=1` with an HTTP origin. This sends login credentials and cookies without encryption; see [LAN configuration](docs/installation.md#lan-access). This guard does not configure TLS or a firewall for you. Never expose zotigod itself as the browser endpoint. File paths refer to the selected daemon machine; the default Local host uses the Web server machine.

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

The GitHub workflow runs installation, tests, type checking and builds on Linux and macOS. It does not replace actual Desktop/browser E2E checks. Test with a disposable project: session creation and streaming, approval/stop/steering, file open/edit/save/reload, image preview/download/upload, workspace lifecycle, and browser login/logout/reconnection. Do not use real project deletion as a smoke test.

See [contributing](CONTRIBUTING.md) for change boundaries.

## License

Zotigo Desktop and Web are licensed under [Apache-2.0](LICENSE). Third-party dependencies retain their own licenses; see [production dependency notices](THIRD_PARTY_NOTICES.md). The maintainer confirms the UI styles were independently authored with other applications used only as visual references; no proprietary font assets are distributed here. Packaged Desktop distributions must additionally retain the license files shipped with their exact Electron/Chromium runtime.
