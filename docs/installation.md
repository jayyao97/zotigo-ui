**English** | [简体中文](zh-CN/installation.md)

# Source installation

The UI installer builds Desktop (default) or Web, and installs the matching local `zotigod` by running the daemon repository's own installer. Both clients can also connect to saved remote daemons; see [Hosts](usage.md#hosts).

| Run | Installs |
| --- | --- |
| `install.sh` | Desktop app + daemon service |
| `install.sh --component web` | Web server + daemon service |

Each run installs one client. To install both, run the installer twice with the same version; the second run reuses the daemon when it matches the pinned revision. The `zotigo` terminal client is not installed; if you want it, run the [daemon repository's installer](https://github.com/jayyao97/zotigo#install) with its default `cli` component and the same prefix.

Prerequisites: Git, curl, tar and a SHA-256 utility (`sha256sum` or `shasum`). On macOS, install Command Line Tools if Git is unavailable. The installer reuses sufficient local Go/Node and the exact required pnpm, or downloads verified private toolchains. Desktop builds download Electron; Web builds skip that download. Linux Desktop also needs a graphical session and Electron's system libraries. Services require systemd user services (Linux) or a macOS GUI login session. Use `--no-service` for hosts managed by another supervisor.

## Install

```sh
# Desktop + daemon
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh | sh
# Web + daemon, on a development server
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --component web
# A development build, another tag, or a full commit
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --version v0.0.4-dev.57
```

| Option | Meaning |
| --- | --- |
| `--component desktop\|web` | Client to install (default `desktop`) |
| `--version TAG\|COMMIT` | UI tag or full 40-character commit to build |
| `--source CHECKOUT` | Build a local UI checkout (cannot be combined with `--version`) |
| `--daemon-source CHECKOUT` | Build the daemon from a local checkout instead of the pinned revision |
| `--prefix PATH` | Install prefix (default `~/.local/share/zotigo`, or `ZOTIGO_INSTALL_PREFIX`) |
| `--no-service` | Do not register or start services |

Without `--version`, the installer selects the numerically highest stable `vX.Y.Z` tag, excluding development tags such as `v0.0.4-dev.57`. It resolves the selected Git object before fetching source and executing that revision's installer. No stable tag means a clear error, not installation of a development branch. After installation, **Settings → Versions and updates** can follow the stable or development channel.

Tags are immutable. `daemon-version` in that UI revision pins a daemon tag or full commit containing the compatible installer and API. GitHub Releases and a latest-version service are not required. The UI release version lives in `package.json`; both Desktop packaging and Web/Desktop installation records read that value. To release, update it, commit it, and publish the matching tag (for example, `0.0.1` → `v0.0.1`). The daemon maintains its own version constant; the two repositories do not need matching version numbers. Each component records its release version, source commit, and dirty state separately in `current/INSTALLATION`. An installer-managed daemon is reused only when its recorded commit matches the pin, both source trees are clean, and its reported release version matches the record. Missing/older records require reinstallation; finish tasks and stop the daemon before replacement. This first installer uses exact pairing rather than inferring compatibility from arbitrary versions.

To test uncommitted changes without publishing:

```sh
sh install.sh --source "$PWD" --daemon-source ../zotigo --component web --no-service --prefix /tmp/zotigo-test
```

`--daemon-source` is a development override of the pin. UI builds run in a disposable copy of the checkout. Use a temporary HOME as well when testing Desktop application shortcuts; `--prefix` isolates installed programs, not OS shortcut locations or user data.

Go must satisfy the paired daemon's `go.mod`; Node must be at least 22.12.0, and pnpm must match `package.json` exactly. Missing or unsuitable tools are downloaded from official distributions into `PREFIX/toolchains/`, using versions and SHA-256 hashes pinned in the paired daemon's `scripts/toolchains.tsv`. Node currently falls back to 22.23.2, Go to the daemon's declared version, and pnpm to 10.30.3. Private downloads support AMD64 and ARM64 on Linux/macOS. Downloads are verified before extraction, checked before publication and protected by per-tool locks. Failed downloads preserve existing installations. No system tools or shell profiles are changed.

The default prefix is `~/.local/share/zotigo` (override with `--prefix` or `ZOTIGO_INSTALL_PREFIX`). Desktop is linked into `~/Applications/Zotigo.app` on macOS, or the user's Linux applications menu. The app includes Electron, so Node is only needed for building it. Web retains the selected Node executable's absolute path and requires that runtime to remain installed, whether it came from the system or the private tool directory. Generated launchers include the selected tool paths, so login-shell initialization is unnecessary. Private version directories are never overwritten during upgrade; remove unused ones only after checking installed launchers. Compiled Web and Desktop main-process code uses Node built-ins; renderer dependencies are bundled by Vite.

## Run and configure

The installer registers/starts the local daemon and, for Web, the Web service. Default addresses are `http://127.0.0.1:8766` and `http://127.0.0.1:8080`. `--no-service` prints the foreground launch paths instead.

- `PREFIX/config/daemon.env`: daemon listen address and token file. The paired daemon installer generates a private random token on first configuration, even for loopback.
- `PREFIX/config/web.env`: Web environment variables, including daemon URL and Web host/port/origin/token.
- `PREFIX/config/desktop.json`: installed Desktop Local connection (`baseUrl` and `tokenFile` path, never token contents). The installed app links to this file so launching from the applications menu needs no shell environment. Explicit `ZOTIGOD_URL` bypasses these defaults, including the token; explicit `ZOTIGOD_AUTH_TOKEN_FILE` overrides the installed token path.

The `.env` files contain trusted shell assignments owned by the installing user; all these configuration files are preserved on upgrade.

Client defaults are created only when the corresponding configuration and `COMPONENT/current/INSTALLATION` are both absent, after daemon installation. They use the daemon's configured token file and address (wildcard bind addresses become loopback URLs). Existing configurations are never rewritten; a new client alongside a legacy unauthenticated daemon remains unauthenticated. Older installed Desktop versions without `desktop.json` keep their environment-based behavior. A missing configuration for an already installed Web service is an error, not a fresh install. Retry after an interrupted installation reuses existing configuration and credentials.

The paired daemon revision is the tag or commit in `daemon-version`. Publish that daemon tag before publishing the UI tag. When testing unpublished changes in both repositories, use `--daemon-source /path/to/zotigo`.

New macOS daemon source installers require a persistent code-signing certificate
and use identifier `com.zotigo.daemon`. Configure it as described in the paired
daemon's `docs/installation.md`; the UI installer inherits
`ZOTIGO_MACOS_SIGNING_IDENTITY` and delegates signing to that installer. A saved
`~/.config/zotigo/macos-signing-identity` is reused on subsequent builds.
Desktop's development daemon builder also calls the source checkout's
`scripts/sign-macos-daemon.sh` before replacing its stable user-data binary.
On macOS, an older daemon checkout without this helper cannot be used for managed
development builds; update it or set `ZOTIGO_DESKTOP_MANAGE_DAEMON=0` and connect
to an already installed daemon. Signing failures preserve the previous binary.
The development daemon and installed daemon use different stable paths and may
need separate macOS permission grants. These changes do not reset system privacy
permissions or provision certificates automatically.

Web generates a login token on first startup if none is configured; read `~/.zotigo/web/access-token` (or `ZOTIGO_WEB_DATA_DIR/access-token`). This owner-only file is reused across restarts. To rotate the token, stop Web and remove the file before starting again. An explicit ZOTIGO_WEB_TOKEN overrides the file without replacing it. Browser login sessions still expire after 12 hours and are invalidated on server restart. The token itself is not printed or logged. See [Web server configuration](#web-server-configuration) for HTTPS, authentication and network requirements. The default Local connection uses the colocated daemon. Saved remote hosts run workspace and text-file operations on their own daemon; the Web backend must be able to reach those addresses.

Linux uses `zotigo-daemon.service` and `zotigo-web.service`:

```sh
systemctl --user status zotigo-web.service
systemctl --user stop zotigo-web.service
systemctl --user start zotigo-web.service
journalctl --user -u zotigo-web.service
```

Configure `loginctl enable-linger "$USER"` for boot/logout persistence (administrator help may be needed). On macOS, use `launchctl print gui/$(id -u)/com.zotigo.web`, `launchctl bootout gui/$(id -u)/com.zotigo.web`, and `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.zotigo.web.plist"`. Replace `web` with `daemon` for the backend. Application logs on both platforms are in `~/.zotigo/logs/`. LaunchAgents run only within a login session; closing Desktop does not stop the daemon.

## Web server configuration

The Web server reads these variables (the installer stores them in `PREFIX/config/web.env`; for `pnpm start:web` set them in the environment):

| Variable | Default / purpose |
| --- | --- |
| `ZOTIGOD_URL` | `http://127.0.0.1:8766`; the Local host. Web requires this endpoint to be loopback. |
| `ZOTIGOD_AUTH_TOKEN_FILE` | Unset; file containing the Local daemon's bearer token |
| `ZOTIGO_WEB_HOST` | `127.0.0.1` |
| `ZOTIGO_WEB_PORT` | `8080` |
| `ZOTIGO_WEB_ORIGIN` | `http://127.0.0.1:<port>`; the exact browser origin, without a path |
| `ZOTIGO_WEB_TOKEN` | Overrides the persisted access token; must be at least 24 characters |
| `ZOTIGO_WEB_DATA_DIR` | `~/.zotigo/web`; Web preferences, saved hosts and the access token |
| `ZOTIGO_WEB_ALLOW_HTTP` | Unset; `1` allows an HTTP origin on a non-loopback bind (see [LAN access](#lan-access)) |

Open the configured origin and sign in with the token from `~/.zotigo/web/access-token`. A successful login sets an HttpOnly, SameSite=Strict cookie that expires after 12 hours. Logout revokes that browser session; a server restart invalidates all of them.

Keep tokens out of source files, shell history, screenshots and shared logs. A token grants access to everything the daemon account can do, not to a single project. Read [security and deployment boundaries](../SECURITY.md) before allowing access from another machine.

### Remote access

Put an HTTPS reverse proxy in front of the Web server and use a network boundary appropriate to your environment. Set `ZOTIGO_WEB_ORIGIN` to the browser's HTTPS origin. Forward the matching `Host` header, disable response buffering for `/api/events`, allow long-lived event connections, and allow request bodies up to 30 MiB of JSON for image uploads. Keep the Web backend port and zotigod unreachable from untrusted networks; TLS must terminate before credentials cross the network.

A non-loopback `ZOTIGO_WEB_HOST` requires an explicit origin, and HTTPS by default. On a trusted LAN you can set `ZOTIGO_WEB_ALLOW_HTTP=1` with an HTTP origin; login credentials and cookies are then sent unencrypted. This check does not configure TLS or a firewall. Never expose zotigod itself as the browser endpoint. File paths refer to the selected daemon's machine; for the Local host that is the Web server machine.

## Local diagnostic logs

Web and Desktop automatically save backend console output, startup/exit events, operation failures and uncaught JavaScript exceptions to `~/.zotigo/logs/web/` and `~/.zotigo/logs/desktop/`. Daemon diagnostics are in `~/.zotigo/logs/daemon/`; standalone CLI diagnostics are in `~/.zotigo/logs/cli/`. Browser DevTools console output is not collected; Desktop renderer crashes/load failures are recorded by the main process.

Each component retains up to 100 MiB total, shared across all processes and restarts. Files rotate individually at 5 MiB, with a separate ceiling of 128 files to bound small-file accumulation. Small logs are kept until either limit requires pruning. Processes write distinct files; concurrent cleanup tolerates already-removed files. Limits are checked after writes, so concurrent writes can briefly exceed the retained budget. Old files are pruned automatically, and single entries are capped at 64 KiB. Files are created with owner-only permissions. Use `ls -lt ~/.zotigo/logs/web/` to locate recent files, then `tail -n 200 /path/to/run-file.log`. Review contents before sharing, because existing error messages can contain private information. Logging is best effort if storage is unavailable.

Installed services discard duplicate stdout/stderr streams to prevent unbounded service log files. Service-manager failures remain inspectable with `systemctl`/`launchctl`. After reinstalling an older service, any legacy `PREFIX/logs/` files remain and can be removed manually once the old service has stopped. Project and conversation history are separate from diagnostic retention and are never pruned by it.

## Upgrade and recover

Installed clients and daemons can be updated from **Settings → Versions and updates**; see the daemon's [Application updates](https://github.com/jayyao97/zotigo/blob/master/docs/application-updates.md) guide. The steps below are for upgrading manually with the installer.

Run the installer with the new UI tag. It builds UI before installing a missing/replacement daemon. Finish tasks and stop the daemon if it needs replacement; quit Desktop or stop/unload Web before replacing that component. The installer refuses to replace running installed programs. Do not independently restart components during installation.

Each component switches its own `current` symlink only after building, retaining `previous`. The bundle is not a cross-repository transaction: if daemon installation succeeds but a later UI step fails, the daemon may already be updated. Fix the reported error and rerun. There is no unattended background upgrade, restart of active tasks, or automatic data downgrade. Startup failures return an error and print the location to inspect; retained builds support manual recovery only when data formats remain compatible.

Configuration and projects/sessions remain outside program version directories. To uninstall, quit Desktop, stop and disable/unload relevant services, remove their service files and installer-owned application shortcut, then remove the relevant component directory. Do not delete `~/.zotigo` to uninstall the application.

## Packaging and platform verification

`pnpm package:desktop` builds a native-architecture application in `build/desktop/` using Electron Packager. Only build outputs, a minimal package manifest and license notices are staged. Electron's own license files remain in its runtime distribution. `pnpm build:web` compiles the Node server and browser assets without the Electron preload build.

These are source-built developer installations, not Developer ID-signed or notarized distributions. Local building is not a guarantee that every macOS security policy permits execution. No installer disables Gatekeeper, removes quarantine or disables Electron's sandbox. Published binaries should have a separate signing/notarization workflow.

## LAN access

Daemon and Web bind addresses are independent. To expose the daemon, set
`ZOTIGOD_ADDR=0.0.0.0:8766` and `ZOTIGOD_AUTH_TOKEN_FILE=/absolute/path/to/daemon.token`
in `PREFIX/config/daemon.env`. Fresh installations already configure a private token file; keep that path and token when changing the listen address. Older unauthenticated installations need a private random token file configured explicitly before restarting.
In `PREFIX/config/web.env`, set:

```sh
ZOTIGOD_URL=http://127.0.0.1:8766
ZOTIGOD_AUTH_TOKEN_FILE=/absolute/path/to/daemon.token
ZOTIGO_WEB_HOST=0.0.0.0
ZOTIGO_WEB_PORT=8080
ZOTIGO_WEB_ORIGIN=http://SERVER_IP:8080
ZOTIGO_WEB_ALLOW_HTTP=1
```

Use the exact configured origin in the browser. `ZOTIGO_WEB_ALLOW_HTTP=1` explicitly
allows plaintext HTTP on a trusted LAN; credentials and session cookies are not
encrypted. For HTTPS, omit it and configure the reverse proxy as described in [Remote access](#remote-access).
Web login remains required, using its separate token in `~/.zotigo/web/access-token`.
Restart both user services after changing configuration.

New installed Desktop clients use `PREFIX/config/desktop.json`; development and older installations use the `ZOTIGOD_URL` and `ZOTIGOD_AUTH_TOKEN_FILE` environment variables;
the token file must exist on the Desktop host. The token is read by the backend,
never returned through UI configuration APIs. API calls, event streams, image previews
and downloads carry the daemon credential. Requests do not follow API redirects;
Desktop image redirects are restricted to configured daemon image paths.

For user services to survive the last SSH logout, run `loginctl enable-linger "$USER"`
(on hosts where permission is granted), then verify `loginctl show-user "$USER" -p Linger`.
