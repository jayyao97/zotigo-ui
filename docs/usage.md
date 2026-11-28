**English** | [简体中文](zh-CN/usage.md)

# Using Desktop and Web

This guide covers the parts of the interface that need more than a sentence in
the [README](../README.md): hosts, search, the files panel, Codex sessions,
Settings and keyboard shortcuts. Desktop and Web share the same interface;
differences are noted where they exist.

## Hosts

A host is a `zotigod` the client talks to. Every client has a built-in **Local**
host (the daemon on the same machine as Desktop, or on the Web server) and can
save remote hosts.

### Add a remote host

1. Open the host menu at the top left and choose **Settings** (or press
   ⌘, / Ctrl+,).
2. Under **General → Connections**, click **Manage**.
3. Add a name, the daemon origin (for example `http://dev:8766`) and its daemon
   token, then click **Test**.
4. Pick the saved host from the host menu.

Use **Add HTTP header** for each gateway credential. For a daemon behind Cloudflare Access, enter `CF-Access-Client-Id` and `CF-Access-Client-Secret` from a service token allowed by the application's Service Auth policy. Keep the daemon token in its own field. Mobile has the same controls under **Devices**. Header values are stored alongside the daemon token and are masked when editing. To change the daemon origin, re-enter the values or remove those headers.

The address must be the daemon's reachable address, not `0.0.0.0` and not the
Web UI URL. A remote daemon must be recent enough to offer directory browsing
and `/files/capabilities`; an older one shows an upgrade message. Use
**Settings → Versions and updates** to update it.

### What switching does

Projects, source inspection, Workspace creation, sessions, events, images and
file editing all use the selected daemon, and file paths refer to that daemon's
machine. Switching hosts checks the connection, asks before discarding drafts or
unsaved edits, and clears the previous host's view. It does not stop work
already running on either daemon.

Desktop remembers its host per device; Web remembers it per browser tab.
Conversation selection and ordering are kept separately for each host.

### Where profiles and tokens are stored

Saved hosts and their daemon tokens are stored in an owner-only `hosts.json`
next to the backend preferences: `ZOTIGO_WEB_DATA_DIR` (default `~/.zotigo/web`)
for Web, Electron's user-data directory for Desktop. Profile lists never return
the token. On a Web server, saved hosts are shared by every signed-in user of
that server, but switching in one tab does not switch another.

Renaming a host keeps its identity. Changing the address, token or HTTP headers replaces it,
so other Web tabs must reload and reselect it. If you change the address or
token of the active connection, the client first switches to Local. The Local
host itself is configured by the startup environment and cannot be edited here.

The browser talks to its Web backend, and the backend talks to the selected
daemon. Desktop connects through its main process. Both use HTTP(S) with bearer
authentication; there is no SSH tunnelling. Use HTTPS outside a trusted network,
because plain HTTP does not encrypt the daemon token. Web login and daemon
authentication are separate.

Older clients ignore the saved-host fields and leave `hosts.json` in place; they
cannot use remote profiles.

## Search

Press ⌘K / Ctrl+K, or click the search icon in the sidebar. The palette searches
recent sessions by title, project or Workspace on the current host, lists
matching Workspaces, and offers quick actions such as creating a session or a
project. Use the arrow keys and Enter to open a result, Esc to close.

Inside a conversation, ⌘F / Ctrl+F searches its messages, including ones not yet
loaded.

## Adding project folders

Folders are chosen with a directory browser that reads the selected daemon's
file system, including for Local and Desktop; no native folder dialog is used.
You can enter a directory, go to its parent, select several folders, or use the
current folder. Directory listings are capped at 1,000 entries with a visible
notice.

## Files panel

Open the side panel at the top right and choose **Browse files**, or press ⌘P / Ctrl+P.
⌘⌥B / Ctrl+Alt+B shows or hides the side panel. Project paths, a Workspace's
**Browse files**, Artifacts, Notes and Markdown directory links open the same
panel.

- The Workspace tree sits beside file tabs. The panel can be resized, expanded
  or hidden without closing files.
- Markdown opens as a preview with a source-editing toggle and autosave. Other
  text files open in the editor; ⌘S / Ctrl+S saves.
- Images and videos open in viewer tabs. Other binary files are not supported.
- Text files can be previewed up to 5 MiB and edited up to 1 MiB. A save is
  rejected if the file changed on disk since it was opened.
- The filename filter applies to loaded entries. Expand folders or refresh to
  update listings.
- Open files and drafts survive switching conversations on the same host, but
  tabs are not restored after reloading the app.

Session details are available from the details button at the top right.

## Conversations

- The composer sends in one of two modes: **steering** adds the message to the
  running turn, **queue** sends it after the turn finishes. ⌘Enter / Ctrl+Enter
  uses the other mode; the default is set in **Settings → General**.
- Tool calls, approvals, subagents, Markdown, Mermaid diagrams and images are
  rendered inline. Approval requests can be approved, or denied with an optional
  reason. Each session has its own approval mode (Manual, Auto or Full access).
- Selected conversation text can be translated into the language chosen in
  **Settings → General → Translation language**.
- Images can be attached to messages; they are uploaded to the selected daemon.

## Codex sessions

When the daemon can find a `codex` executable, new sessions can use Codex instead
of the Zotigo agent. Codex uses its own login and model catalog; the API profiles
in **Settings → Models** do not affect it. **Settings → General → Sync sessions**
imports recent Codex sessions from the host, and the Models page can reload the
Codex model list.

Imported Codex messages that contained screenshots show the image thumbnails
above the original request. The generated attachment text is hidden only when
its file paths match the recorded images. Images are fetched through the selected
daemon's authenticated image API, not read from the client machine. If the
original temporary file was deleted, the thumbnail shows an unavailable state
with a retry option.

The daemon's Codex discovery rules are described in the
[daemon installation guide](https://github.com/jayyao97/zotigo/blob/master/docs/installation.md#codex-discovery-in-background-services).

## Channels

The **Channels** page in the sidebar connects a Feishu/Lark bot to the daemon,
lists the groups it belongs to, and binds a group or topic to a Workspace or
session. The daemon owns the connection, so it keeps working when the client is
closed. Field-level behavior (sender policies, `/bind`, progress detail) is in
the [zotigod API reference](https://github.com/jayyao97/zotigo/blob/master/docs/zotigod-api.md#channels).

## Settings

Open with ⌘, / Ctrl+, or from the host menu. Esc returns to the conversation.

| Page | Contains |
| --- | --- |
| General | Interface language (English or 简体中文), default send mode, translation language, thinking display, channel activity in the sidebar, session sync, connections (hosts), performance diagnostics |
| Models | Model profiles on a chosen host, connection test, favourite models, Codex model refresh |
| Usage | Token activity over time, filterable by model and source (Channels or not), with per-session rankings |
| Versions and updates | Installed client and daemon versions, stable or development channel, check, prepare and apply updates |

Updates are described in the daemon's
[Application updates](https://github.com/jayyao97/zotigo/blob/master/docs/application-updates.md)
guide. Desktop quits and relaunches itself when an update is applied.

## Keyboard shortcuts

| macOS | Windows / Linux | Action |
| --- | --- | --- |
| ⌘K | Ctrl+K | Search sessions and Workspaces |
| ⌘P | Ctrl+P | Open the files panel |
| ⌘⌥B | Ctrl+Alt+B | Show or hide the side panel |
| ⌘F | Ctrl+F | Find in conversation |
| ⌘, | Ctrl+, | Settings |
| ⌘S | Ctrl+S | Save the file in the editor |
| ⌘Enter | Ctrl+Enter | Send in the other mode (steering or queue) |
| Esc | Esc | Close the palette or Settings |

The Feishu Channel connection settings on Desktop, Web and mobile accept a trusted COT hostname. Clear the field to use the default, `fsopen.bytedance.net`.
