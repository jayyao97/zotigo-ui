# Desktop performance diagnostics

Open Settings → General → Performance diagnostics. Diagnostic mode is opt-in and persists across restarts. It belongs to the local Desktop installation: selecting a remote daemon does not move the logs to that host. Web retains its existing in-memory diagnostic export.

## Collection and retention

The recorder captures interaction stages for session switches and message sends, renderer long tasks, renderer error counts, application request durations/results, SSE connection status, desktop event-loop delay, and window/renderer failures. Request durations include application work and remote round trips; they do not independently distinguish network latency from daemon processing. Animation-frame marks indicate paint opportunities, not guaranteed completion of rendering.

Logs live under Electron's user-data directory in `diagnostics/` (on macOS, normally `~/Library/Application Support/Zotigo/diagnostics/`). UTC date directories contain hourly JSONL files. Files rotate at 5 MiB; retention is bounded by seven days and 100 MiB. Cleanup runs on startup, rotation, export, and periodically during writes. No empty hourly files are created. The preference is stored separately from the records, so clearing logs does not disable collection.

Renderer samples are buffered in bounded batches. Disk writes and compression are asynchronous and serialized. Overflow is counted and surfaced in Settings instead of blocking interaction. Ordinary quit allows up to five seconds for renderer-buffer flushing, an active profile, and disk writes. Forced termination can still lose the newest buffered samples; exports preserve valid lines if a crash leaves a truncated record.

## Export and CPU recording

Export Last hour, Today (local calendar day), or All retained logs to a `.jsonl.gz` file. The export is a snapshot and does not disable collection. The native save dialog permits cancellation. Clearing logs asks for confirmation and is unavailable during a CPU recording.

For function-level investigation, enable diagnostics and choose Record 30 seconds. Close DevTools first. Sampling stops automatically, or earlier when diagnostics is disabled or the app quits. The resulting `cpu-profile` JSONL record contains a Chrome-compatible `profile` object. Extract that object as a `.cpuprofile` file to inspect it in DevTools. Recording is optional and has more overhead than ordinary timing collection; it samples the page renderer, not the desktop main process.

## Fields and privacy

Records include application version, a random startup identifier (`run`), and UTC receipt time (`time`). Renderer marks also include monotonic `at` and `timeOrigin`, so their occurrence time can be reconstructed despite batching. Interaction marks share an `operation`; their host context is captured when the interaction starts. Host identifiers are hashed with a per-startup random key. Global renderer long tasks and error counts are not attributed to a daemon host.

The diagnostic boundary admits only known renderer event types and numeric timing/count fields. It does not collect message bodies, tool results, request arguments, response bodies, full request URLs, or credentials. Error text and stacks are excluded from the constant-time event recorder. CPU profiles include JavaScript function names and sanitized script basenames; absolute source URLs and paths are removed.

Existing Desktop console logs are separate and are not included in these exports. Automatic upload is not implemented.
