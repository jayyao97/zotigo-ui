# Zotigo Mobile

React Native and Expo client for Zotigo daemons. The app connects directly to the public HTTP/SSE API and shares types and display logic through `@zotigo/shared`. It does not depend on Electron or the Node backend.

## Development

Use Node.js compatible with the React Native version in `package.json` and the pnpm version pinned by the repository. Run installation from the repository root so workspace dependencies resolve correctly:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @zotigo/mobile start
```

The mobile package requires the root workspace configuration, lockfile, and `shared/` package. Native dependencies and Expo configuration changes require rebuilding the native app; ordinary TypeScript changes use Metro updates.

## iOS builds

Local iOS builds require macOS, Xcode, and an installed iOS Simulator runtime. From `mobile/`:

```sh
# Generate the native project, install Pods, and run in the simulator.
corepack pnpm ios

# Build and install on a connected device.
corepack pnpm ios --device

# Include the JavaScript bundle for use without Metro.
corepack pnpm ios --configuration Release --device
```

Device builds require Xcode signing configuration. Use a suitable bundle identifier in `app.config.ts`, select a signing team in the generated Xcode workspace, and enable Developer Mode on the device when required. Allow local network access when connecting to a LAN daemon. See [Expo local builds](https://docs.expo.dev/guides/local-app-development/) for environment setup.

The generated `ios/` and `android/` directories are ignored. Keep native configuration in `app.config.ts` and config plugins.

## Connecting to daemons

Add each device with a name, daemon origin, and token. Test the connection, then select the device to open its projects and conversations. The phone must be able to reach the daemon over its configured network or VPN.

Tokens use SecureStore; device metadata and drafts use AsyncStorage. Drafts are scoped by device and session. Editing a name or token preserves device identity; changing the origin adds a separate device. Only the selected device has an active navigation context, and conversation streams stop when the screen loses focus or the app enters the background.

## Features and limits

The app supports project and workspace management, source registration, session search, streaming conversations, image attachments, skills, approvals, interactive questions, session controls, and remote text-file editing. Settings expose daemon health, runtimes, profiles, and skills. Channels support browsing and navigation to associated sessions.

Current limits:

- No permanent project/workspace deletion, custom navigation ordering, or project pinning. Workspace and session pins use the daemon navigation catalog.
- No archived-history browser or desktop diff/editor parity.
- Text editing is limited to 256 KiB. Revision conflicts preserve the draft; file content reload is manual, with a freshness reminder on foreground return.
- Channel configuration editing, push notifications, and background streaming are not implemented.
- Navigation does not restore the last open page after restarting the app.

See [Mobile architecture](../docs/mobile-architecture.md) for module ownership and state invariants.

## Checks

From the repository root:

```sh
corepack pnpm --filter @zotigo/mobile typecheck
corepack pnpm --filter @zotigo/mobile test
corepack pnpm --filter @zotigo/mobile export:ios --max-workers 2
```

The default tests do not contact a running daemon. The optional integration test starts an isolated child daemon with temporary storage and credentials; it does not start a model worker:

```sh
ZOTIGO_MOBILE_TEST_DAEMON=/absolute/path/zotigod corepack pnpm --filter @zotigo/mobile exec tsx --test tests/daemon.integration.ts
```

Run the root tests, typecheck, and build after changing shared code or workspace configuration. JavaScript export checks bundle construction only; native compilation, signing, Keychain, network behavior, gestures, keyboard handling, and scrolling performance require iOS validation.

For reproducible Linux layout and interaction checks with synthetic multi-host data, see the [fixture preview](tests/preview/README.md). It renders the production screens through a separate test entry and does not contact real daemons.

Home restores the last selected device (or connects the only saved device). Device configuration lives under Settings → Devices. Workspace lists initially show five conversations; search includes the full catalog. Models and runtimes have a separate Settings page; skills are selected with `/` in the conversation composer. While a response is active, an empty composer shows Stop; entering text or attaching an image switches it to Send.

On iOS, touch and hold formatted message text to select a passage in place. The native menu offers Copy, Add to conversation and Translate; there is no separate source-selection page. Translation opens a compact result sheet and uses the daemon's public `POST /sessions/{id}/translate` endpoint. References persist in the host/session draft without sending. Android and browser fixtures retain their platform text-selection menu; custom selection actions are iOS-only. The local Expo module in `modules/selectable-text` requires Pods installation and a native rebuild. Native selection handles, menu positioning and scroll gestures must be verified on iOS; browser previews do not cover them.

Code fences use native syntax colors, wrap and copy controls. Previews cap at 20,000 characters; copying preserves the complete source. Mermaid diagrams open on demand in one isolated, offline viewer (50,000 characters / 300 edges), with source still readable in the message. The bundled Mermaid runtime is generated automatically by start, ios, android, typecheck and export:ios scripts; direct Expo commands require `corepack pnpm prepare:renderers` first. Browser fixtures use a sandboxed iframe; iOS uses react-native-webview and needs a native rebuild after this dependency change.
