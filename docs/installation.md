# Source installation

The UI installer builds Desktop (default) or Web plus a paired local `zotigod`. It uses the daemon repository's installer; there is no extra repository or management CLI. Desktop currently uses `ZOTIGOD_URL` for a daemon endpoint override; there is no connection-settings page yet.

Prerequisites: Git, curl, tar and a SHA-256 utility (`sha256sum` or `shasum`). On macOS, install Command Line Tools if Git is unavailable. The installer reuses sufficient local Go/Node and the exact required pnpm, or downloads verified private toolchains. Desktop builds download Electron; Web builds skip that download. Linux Desktop also needs a graphical session and Electron's system libraries. Services require systemd user services (Linux) or a macOS GUI login session. Use `--no-service` for hosts managed by another supervisor.

## Install

After both installers are merged and an initial stable UI tag is published:

```sh
# Desktop + daemon
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh | sh
# Web + daemon, on a development server
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --component web
# Optional: select a specific tag or full commit
curl -fsSL https://raw.githubusercontent.com/jayyao97/zotigo-ui/master/install.sh |
  sh -s -- --version v0.0.1
```

By default, the installer selects the numerically highest stable `vX.Y.Z` tag, excluding prereleases. It resolves the selected Git object before fetching source and executing that revision's installer. No stable tag means a clear error, not installation of a development branch.

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

- `PREFIX/config/daemon.env`: daemon listen address and optional token file.
- `PREFIX/config/web.env`: Web environment variables, including daemon URL and Web host/port/origin/token.
- These are trusted shell assignment files owned by the installing user and preserved on upgrade.

Web generates a login token on startup if none is configured; read `~/.zotigo/web/access-token` (or `ZOTIGO_WEB_DATA_DIR/access-token`). This owner-only file is replaced after a successful startup, and the token changes on restart. The token itself is not printed or logged. See [README remote access](../README.md#remote-access) for HTTPS, authentication and network requirements. Web runs on the same host as the daemon. Desktop can connect remotely, but local file operations are not a remote filesystem implementation.

Linux uses `zotigo-daemon.service` and `zotigo-web.service`:

```sh
systemctl --user status zotigo-web.service
systemctl --user stop zotigo-web.service
systemctl --user start zotigo-web.service
journalctl --user -u zotigo-web.service
```

Configure `loginctl enable-linger "$USER"` for boot/logout persistence (administrator help may be needed). On macOS, use `launchctl print gui/$(id -u)/com.zotigo.web`, `launchctl bootout gui/$(id -u)/com.zotigo.web`, and `launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.zotigo.web.plist"`. Replace `web` with `daemon` for the backend. Application logs on both platforms are in `~/.zotigo/logs/`. LaunchAgents run only within a login session; closing Desktop does not stop the daemon.

## Local diagnostic logs

Web and Desktop automatically save backend console output, startup/exit events, operation failures and uncaught JavaScript exceptions to `~/.zotigo/logs/web/` and `~/.zotigo/logs/desktop/`. Daemon diagnostics are in `~/.zotigo/logs/daemon/`; standalone CLI diagnostics are in `~/.zotigo/logs/cli/`. Browser DevTools console output is not collected; Desktop renderer crashes/load failures are recorded by the main process.

Each component retains up to 100 MiB total, shared across all processes and restarts. Files rotate individually at 5 MiB, with a separate ceiling of 128 files to bound small-file accumulation. Small logs are kept until either limit requires pruning. Processes write distinct files; concurrent cleanup tolerates already-removed files. Limits are checked after writes, so concurrent writes can briefly exceed the retained budget. Old files are pruned automatically, and single entries are capped at 64 KiB. Files are created with owner-only permissions. Use `ls -lt ~/.zotigo/logs/web/` to locate recent files, then `tail -n 200 /path/to/run-file.log`. Review contents before sharing, because existing error messages can contain private information. Logging is best effort if storage is unavailable.

Installed services discard duplicate stdout/stderr streams to prevent unbounded service log files. Service-manager failures remain inspectable with `systemctl`/`launchctl`. After reinstalling an older service, any legacy `PREFIX/logs/` files remain and can be removed manually once the old service has stopped. Project and conversation history are separate from diagnostic retention and are never pruned by it.

## Upgrade and recover

Run the installer with the new UI tag. It builds UI before installing a missing/replacement daemon. Finish tasks and stop the daemon if it needs replacement; quit Desktop or stop/unload Web before replacing that component. The installer refuses to replace running installed programs. Do not independently restart components during installation.

Each component switches its own `current` symlink only after building, retaining `previous`. The bundle is not a cross-repository transaction: if daemon installation succeeds but a later UI step fails, the daemon may already be updated. Fix the reported error and rerun. There is no silent automatic upgrade, restart of active tasks, or automatic data downgrade. Startup failures return an error and print the location to inspect; retained builds support manual recovery only when data formats remain compatible.

Configuration and projects/sessions remain outside program version directories. To uninstall, quit Desktop, stop and disable/unload relevant services, remove their service files and installer-owned application shortcut, then remove the relevant component directory. Do not delete `~/.zotigo` to uninstall the application.

## Packaging and platform verification

`pnpm package:desktop` builds a native-architecture application in `build/desktop/` using Electron Packager. Only build outputs, a minimal package manifest and license notices are staged. Electron's own license files remain in its runtime distribution. `pnpm build:web` compiles the Node server and browser assets without the Electron preload build.

These are source-built developer installations, not Developer ID-signed or notarized distributions. Local building is not a guarantee that every macOS security policy permits execution. No installer disables Gatekeeper, removes quarantine or disables Electron's sandbox. Published binaries should have a separate signing/notarization workflow.
