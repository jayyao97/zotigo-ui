# Security boundaries

Zotigo can run agents and modify files using the operating-system account that runs zotigod and the client backend. Treat access to this UI as access to that workspace account. Web is a single-owner workspace client, not a multi-tenant service: all holders of its access token share the same projects, conversations, files and agent capabilities.

## Deployment

- Default Web binding is loopback. For remote use, put HTTPS in front of the service, configure the exact public origin, preserve its Host header, and restrict backend ports with network controls. An HTTPS origin setting does not encrypt the backend listener.
- Do not expose zotigod directly to the public internet. The Web backend expects it on the same host because file operations use local authorized roots.
- The Web access token is independent of agent-provider credentials. Do not put either into this repository or embed them in frontend bundles.
- Anyone with the token can initiate agent actions and destructive catalog operations offered by the UI. Project selection and per-tab preferences are not authorization boundaries.
- Browser login cookies last 12 hours, are revoked on logout, and become invalid on server restart. Restarting with a new token also prevents the previous token from creating new sessions. Revoking UI access does not cancel an agent task already accepted by the daemon.
- Back up valuable data before testing workspace removal or agent file modifications. UI confirmation and file-root validation do not provide an operating-system sandbox for the daemon.

Desktop disables renderer Node access and uses context isolation, sandboxed preload, sender validation and allowlisted application operations. Web validates host/origin, requires authenticated JSON requests for mutations, restricts image proxy routes, and bounds incoming bodies and event frames. These checks do not constitute a guarantee against all vulnerabilities; the Web path still requires deployment-specific security review.

Diagnostic logs are stored under `~/.zotigo/logs/`, with a 100 MiB retention budget per component, a 5 MiB per-file limit, a 128-file ceiling, and owner-only file permissions. Generated Web tokens are stored separately in `ZOTIGO_WEB_DATA_DIR/access-token` (default `~/.zotigo/web/access-token`), never intentionally logged. Existing error messages and external tool output may still contain sensitive material; inspect logs before sharing.

## Reports and sensitive material

Do not disclose tokens, private prompts, source files or exploit details in public issues. A dedicated private vulnerability-reporting channel has not yet been published. Until one is available, arrange a private channel with the maintainer before sharing sensitive details. Rotate exposed credentials independently of any Git-history cleanup: removing a file or publishing a fresh init commit does not invalidate a leaked secret.
