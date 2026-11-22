/** Explicit opt-in: ZOTIGO_MOBILE_TEST_DAEMON=/absolute/path/zotigod pnpm --filter @zotigo/mobile exec tsx --test tests/daemon.integration.ts
 * Starts only a fresh child daemon; never accepts a user daemon URL. No worker is started.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { ApiError, DaemonClient } from "../src/core/client";

const binary = process.env.ZOTIGO_MOBILE_TEST_DAEMON;
test(
  "mobile public client interoperates with isolated real daemon",
  { skip: !binary, timeout: 45000 },
  async () => {
    assert.ok(
      binary && path.isAbsolute(binary),
      "Supply an absolute daemon binary path.",
    );
    await access(binary);
    const root = await mkdtemp(
      path.join(tmpdir(), "zotigo-mobile-integration-"),
    );
    const home = path.join(root, "home");
    const source = path.join(root, "source");
    await mkdir(home);
    await mkdir(source);
    await writeFile(path.join(source, "sample.txt"), "original\n");
    const token = randomBytes(32).toString("hex");
    const tokenPath = path.join(root, "token");
    await writeFile(tokenPath, token, { mode: 0o600 });
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const address = probe.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    // Child-only environment: never modify the developer shell's HOME or import credentials/config.
    const child = spawn(
      binary,
      ["--addr", `127.0.0.1:${port}`, "--auth-token-file", tokenPath],
      {
        cwd: root,
        env: {
          NODE_ENV: "test",
          PATH: "/usr/bin:/bin",
          HOME: home,
          XDG_CONFIG_HOME: path.join(root, "config"),
          XDG_CACHE_HOME: path.join(root, "cache"),
          XDG_DATA_HOME: path.join(root, "data"),
          CODEX_HOME: path.join(root, "codex"),
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let log = "";
    child.stderr.on("data", (chunk) => {
      log = (log + String(chunk)).slice(-10000);
    });
    const client = new DaemonClient(
      {
        id: "integration",
        name: "Temporary test daemon",
        baseUrl: `http://127.0.0.1:${port}`,
        token,
      },
      fetch,
    );
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (child.exitCode !== null)
          throw new Error(`Isolated daemon exited: ${log}`);
        try {
          const health = (await client.health()) as {
            status: string;
            process_id?: string;
          };
          assert.equal(
            health.process_id,
            String(child.pid),
            "Refuse to test a daemon not spawned by this harness.",
          );
          assert.equal(health.status, "ok");
          ready = true;
          break;
        } catch (error) {
          if (error instanceof assert.AssertionError) throw error;
          await delay(100);
        }
      }
      assert.ok(ready, `Daemon did not become ready: ${log}`);
      const anonymous = new DaemonClient(
        { ...client.connection, token: "" },
        fetch,
      );
      await assert.rejects(
        anonymous.projects(),
        (error: unknown) => error instanceof ApiError && error.status === 401,
      );
      anonymous.dispose();
      assert.deepEqual(await client.projects(), []);
      const project = await client.createProject("Mobile integration");
      assert.equal(
        (await client.renameProject(project.id, "Renamed integration")).name,
        "Renamed integration",
      );
      const inspection = await client.inspectSource(source);
      assert.equal(inspection.kind, "folder");
      const registered = await client.addSource(
        project.id,
        inspection.canonical_path,
        "reference",
      );
      assert.equal(
        (await client.project(project.id)).sources[0]?.id,
        registered.id,
      );
      const folders = await client.listDirectory(root, undefined, true);
      assert.ok(folders.entries.some((entry) => entry.path === source));
      const workspace = await client.createWorkspace(project.id, "Workspace", [
        { source_id: registered.id, mode: "reference" },
      ]);
      assert.ok(
        (await client.workspaces(project.id)).some(
          (item) => item.id === workspace.id,
        ),
      );
      assert.equal(
        (await client.renameWorkspace(workspace.id, "Renamed workspace")).title,
        "Renamed workspace",
      );
      assert.equal(
        (await client.workspaceSources(workspace.id))[0]?.source.id,
        registered.id,
      );
      const listing = await client.listDirectory(source);
      assert.ok(listing.entries.some((entry) => entry.name === "sample.txt"));
      const opened = await client.openFile(path.join(source, "sample.txt"));
      assert.equal(opened.kind, "text");
      if (opened.kind !== "text") throw new Error("Expected text snapshot");
      const baseline = opened.file;
      const saved = await client.saveFile({
        path: baseline.path,
        content: "mobile edit\n",
        expectedMtimeMs: baseline.mtimeMs,
        expectedContentRevision: baseline.contentRevision,
      });
      assert.equal(saved.content, "mobile edit\n");
      await assert.rejects(
        client.saveFile({
          path: baseline.path,
          content: "stale edit",
          expectedMtimeMs: baseline.mtimeMs,
          expectedContentRevision: baseline.contentRevision,
        }),
        (error: unknown) => error instanceof ApiError && error.status === 409,
      );
      assert.deepEqual(await client.catalog(), []);
      const preview = await client.archivePreview(workspace.id);
      assert.equal(preview.workspace_id, workspace.id);
      assert.equal(
        (await client.archiveWorkspace(workspace.id)).status,
        "archived",
      );
      await client.removeSource(project.id, registered.id);
      assert.equal((await client.project(project.id)).sources.length, 0);
    } finally {
      client.dispose();
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(3000)]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
          await once(child, "exit");
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
