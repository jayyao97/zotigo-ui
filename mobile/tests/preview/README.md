# Linux visual / interaction preview

This independent Expo **web-only test application** renders the real Zotigo App, navigation, screens and components. Its Metro resolver substitutes only the two native platform adapters with in-memory fixture storage and a deterministic daemon transport. Production entry/config/routes are untouched; production SecureStore does not gain a web fallback. No real daemon, account, token or network request is used.

Run from the repository root after installing normal workspace dependencies:

```sh
cd mobile/tests/preview
../../node_modules/.bin/expo export --platform web --max-workers 2
python3 -m http.server 8091 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8091` in a browser at a phone viewport such as 393×852. Static export avoids Linux filesystem-watch limits. Re-export and reload to see source changes. `expo start --web --port 8091` is optional on hosts with adequate watch limits.

The two preset devices intentionally share session IDs while their titles/data differ. Click Home Mac Studio or Work Linux, then exercise real UI navigation. Fixtures provide projects, ready/error workspaces, long Markdown/tool/reasoning/subagent conversation history, a pending approval, an image attachment, streaming reply, directory/text/image browsing, conflict save responses, settings and Channels. Reloading resets memory-only data and drafts.

Browser console/CDP controls:

```js
__ZOTIGO_PREVIEW__.snapshot("home"); // visible session identities + active stream count
__ZOTIGO_PREVIEW__.fault("home", "catalog"); // pull Home to refresh: display 503 error
__ZOTIGO_PREVIEW__.fault("home", "offline");
__ZOTIGO_PREVIEW__.disconnect("home"); // close current SSE to exercise reconnect
__ZOTIGO_PREVIEW__.fault("home", "none"); // recover
__ZOTIGO_PREVIEW__.fault("home", "save-conflict"); // save preserves editor draft
__ZOTIGO_PREVIEW__.fault("home", "unauthorized");
__ZOTIGO_PREVIEW__.fault("home", "send-rejected"); // HTTP 400 preserves editable draft
__ZOTIGO_PREVIEW__.snapshot("home").lastSubmission; // exact body / request ID / accepted status
```

Faults accept `home` or `work`. File-conflict mode is persistent until cleared. Saving edits, rename/pin/archive, session/project/workspace creation, approvals and message send affect only test memory. Message image MIME declarations are checked against the actual PNG/JPEG/WebP byte prefix; invalid image data returns HTTP 400. Unknown origins and unimplemented endpoints fail explicitly. All fixtures are synthetic, including the programmatically drawn attachment.

This validates rendered UI density, navigation/action wiring, empty/error states, host isolation and draft workflows under React Native Web. It does **not** validate iOS keyboard or swipe physics, native accessibility, Keychain, photo picker encoding, native fetch/ATS/VPN, signing, or native frame performance. Browser screenshots must be labeled fixture web previews, not iPhone screenshots.

## Automated browser smoke

With static server running and the existing shared Chrome exposing CDP on localhost:9222:

```sh
node mobile/tests/preview/smoke.mjs /absolute/workspace/artifacts/mobile-preview-smoke
```

Run from the repository root. Output directory must be absolute and outside the source repository. The script creates its own tab, sets a 393×852 viewport at 2× scale, and always closes that tab. It never launches Chrome or touches existing tabs. It emits numbered screenshots and `smoke.json` with assertions and any uncaught runtime errors.

It exercises both hosts, project/workspace navigation, tool expansion, a real image render, a browser-encoded JPEG deliberately named `.png` through `DOM.setFileInputFiles`, HTTP 400 rejection with draft retention/no Reconnect, recovery/send MIME and request ID, release of the event stream on leaving, and same-session-ID isolation on the second host. A generated upload file is stored only in the requested output directory.
