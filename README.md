<p align="center">
  <img src="public/brand/zotigo-app.png" alt="Zotigo" width="112" height="112" />
</p>

<h1 align="center">Zotigo Desktop and Web</h1>

<p align="center">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/jayyao97/zotigo">zotigo</a>: agent, daemon and terminal client
  ·
  <strong>zotigo-ui</strong>: Desktop, Web and iOS apps
</p>

Desktop (Electron), Web and iOS clients for [Zotigo](https://github.com/jayyao97/zotigo),
a coding agent that runs its sessions in a local service called `zotigod`. The
clients manage projects and Workspaces, run Zotigo or Codex sessions, show tool
calls and approvals as they stream, and edit files on the daemon's machine. They
can switch between the local daemon and remote ones.

Desktop and Web share the same React interface and application services. The
iOS app in [`mobile/`](mobile/README.md) uses the same daemon API and shared
types.

## Which repository do I install from?

| You want | Install from | What gets installed |
| --- | --- | --- |
| Desktop app or Web UI | This repository | The UI **and** a matching `zotigod`. The `zotigo` terminal command is not included. |
| Terminal (TUI) | [zotigo](https://github.com/jayyao97/zotigo#install) | `zotigod` and the `zotigo` command. |
| Both | Both installers, with the same `--prefix` (the default) | One shared daemon used by every client. |

The agent, the daemon, model configuration and the daemon API are documented in
the [zotigo repository](https://github.com/jayyao97/zotigo).

## Install

The installer builds the client from source and installs the matching `zotigod`
as a user service, so this one command is all a UI user needs. Linux and macOS
are supported; Git, curl, tar and `sha256sum` or `shasum` are required. Go, Node
and pnpm are downloaded into the install prefix if suitable versions are missing.

```sh
# Desktop app + daemon
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh | sh

# Web server + daemon (for example on a development server)
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --component web
```

- Each run installs one client. For both Desktop and Web, run it twice; the
  daemon is shared.
- The `zotigo` terminal client is not included. Install it from the
  [zotigo repository](https://github.com/jayyao97/zotigo#install) if you want it.
- By default the newest stable `vX.Y.Z` tag is built. Development builds are
  tagged `vX.Y.Z-dev.N`; select one with `--version`, for example
  `sh -s -- --version v0.0.4-dev.57`.
- The daemon version is pinned by [`daemon-version`](daemon-version).
- On macOS the daemon build needs a persistent code-signing identity. Desktop
  builds are not Developer ID signed or notarized.

Desktop appears as `~/Applications/Zotigo.app` on macOS or in the Linux
applications menu. Web listens on `http://127.0.0.1:8080`; sign in with the token
in `~/.zotigo/web/access-token`.

[Installation](docs/installation.md) covers all options, services, upgrades,
logs, LAN and HTTPS setups, and uninstalling.

## First steps

1. Add a model in **Settings → Models** (⌘, / Ctrl+,), or edit
   `~/.zotigo/config.yaml` on the daemon host as described in the
   [daemon configuration guide](https://github.com/jayyao97/zotigo/blob/master/docs/configuration.md).
   Codex sessions use your Codex login instead.
2. Create a project and add source folders from the daemon's file system.
3. Start a session, from the project or a Workspace.

## Features

- Projects, Sources and Workspaces from the daemon's catalog, with pinning,
  ordering and unread state.
- Zotigo and Codex sessions, with streamed tool calls, approvals, subagents,
  Markdown, Mermaid and images. Messages can steer a running turn or be queued.
- A files panel for browsing and editing text files, Markdown preview, and
  image and video viewers.
- Remote hosts: save several daemons and switch between them.
- Channels: connect a Feishu/Lark bot to a Workspace or session.
- Settings for models, token usage, in-app updates (stable or development
  channel) and interface language (English and 简体中文).
- Search palette, find in conversation, and translation of selected text.

[Using Desktop and Web](docs/usage.md) explains hosts, the files panel, Codex
sessions, Settings and all keyboard shortcuts. The most used ones:

| macOS | Windows / Linux | Action |
| --- | --- | --- |
| ⌘K | Ctrl+K | Search sessions and Workspaces |
| ⌘P | Ctrl+P | Open the files panel |
| ⌘F | Ctrl+F | Find in conversation |
| ⌘, | Ctrl+, | Settings |

## Security

Access to these clients is access to the operating-system account that runs the
daemon: agents can run commands and modify files there. Web binds to loopback by
default. For access from other machines, put HTTPS in front of it and keep
zotigod off untrusted networks. Read [SECURITY.md](SECURITY.md) and the
[Web server configuration](docs/installation.md#web-server-configuration) before
exposing either.

## Development

Requires Node.js 22.12 or newer and pnpm 10.30.3 (the `packageManager` in
`package.json`).

```sh
pnpm install --frozen-lockfile
pnpm dev                # Desktop with Vite on http://127.0.0.1:5173
```

Desktop connects to `http://127.0.0.1:8766` (override with `ZOTIGOD_URL`). If no
daemon is healthy at a loopback URL, development Desktop builds `zotigod` from
the source checkout in `ZOTIGOD_WORKDIR` (default `../zotigo`; Go required) and
starts it. Set `ZOTIGO_DESKTOP_MANAGE_DAEMON=0` to require an already running
daemon. If port 5173 is busy, run Vite on another loopback port and set
`ZOTIGO_DESKTOP_DEV_SERVER_URL`.

```sh
pnpm build && pnpm start:desktop   # built renderer, loaded the way a packaged app loads it
pnpm build && pnpm start:web       # Web server; needs a running daemon
pnpm package:desktop               # native app in build/desktop/
```

Web never starts a daemon. Its environment variables are listed in
[Web server configuration](docs/installation.md#web-server-configuration). To
test an unpublished installer with a local daemon checkout:

```sh
sh install.sh --source "$PWD" --daemon-source ../zotigo --component web --no-service --prefix /tmp/zotigo-test
```

Before submitting changes:

```sh
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

CI runs these plus the installer tests and Desktop packaging on Linux and macOS.
It does not replace testing the real Desktop and browser flows; see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | Shared React UI: conversation rendering, editor, files panel, settings |
| `shared/` | `@zotigo/shared`: daemon DTOs, client types, operation mapping, i18n catalogs |
| `backend/` | Public daemon API client, application operations, local files, updates |
| `electron/` | Desktop main process, preload/IPC, native dialogs, development daemon manager |
| `web/`, `src/web/` | Web server authentication, HTTP/SSE transport, login |
| `mobile/` | React Native/Expo app for iPhone and iPad |
| `tests/` | Node tests, including the layering rule |
| `scripts/` | Desktop packaging, installer helpers and tests, license notices |
| `resources/`, `public/` | Icons and brand assets |
| `install.sh`, `daemon-version`, `update.json` | Source installer, paired daemon revision, update manifest |

The renderer never calls zotigod directly. Desktop goes through a narrow preload
API and Web through authenticated same-origin HTTP; both reach the same
application service in `backend/`. [Architecture](docs/architecture.md) explains
the layers and the dependency rule that `tests/layering.test.ts` enforces.

## Documentation

| Document | Contents |
| --- | --- |
| [Installation](docs/installation.md) ([中文](docs/zh-CN/installation.md)) | Installer options, services, Web configuration, LAN and HTTPS, upgrades, logs |
| [Using Desktop and Web](docs/usage.md) ([中文](docs/zh-CN/usage.md)) | Hosts, search, files panel, Codex, Channels, Settings, shortcuts |
| [Architecture](docs/architecture.md) | Process model and layers |
| [Localization](docs/localization.md) | Adding and translating UI text |
| [Mobile](mobile/README.md), [Mobile architecture](docs/mobile-architecture.md) | iOS app development |
| [Performance diagnostics](docs/performance-diagnostics.md) | Opt-in Desktop performance recording |

User guides are available in English and Chinese. Developer references are in
English only.

## License

[Apache-2.0](LICENSE). Third-party dependencies keep their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The UI styles were written
independently, with other applications used only as visual references, and no
proprietary font assets are distributed. Packaged Desktop distributions must also
keep the license files shipped with their Electron/Chromium runtime.
