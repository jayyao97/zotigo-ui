import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getDaemonConfig, health } from "../backend/zotigod";

let managedProcess: ChildProcessWithoutNullStreams | null = null;

export async function startManagedZotigodIfNeeded(appPath: string, userDataPath: string): Promise<void> {
  if (process.env.ZOTIGO_DESKTOP_MANAGE_DAEMON === "0") {
    return;
  }
  if (await isZotigodHealthy()) {
    return;
  }

  const workdir = resolveZotigoWorkdir(appPath);
  if (!workdir) {
    console.warn("[zotigo] zotigo repo not found; skipping managed zotigod startup");
    return;
  }

  const daemonUrl = new URL(getDaemonConfig().baseUrl);
  if (!isLoopbackDaemon(daemonUrl)) {
    console.warn(`[zotigo] ${daemonUrl.origin} is not a local daemon; skipping managed zotigod startup`);
    return;
  }

  const binaryPath = managedZotigodBinaryPath(userDataPath);
  try {
    await buildManagedZotigod(workdir, binaryPath);
  } catch (error) {
    console.warn(`[zotigo] failed to build managed zotigod: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  managedProcess = spawn(binaryPath, ["--addr", daemonUrl.host], {
    cwd: workdir,
    env: process.env,
    stdio: "pipe",
  });

  managedProcess.stdout.on("data", (chunk: Buffer) => {
    writeDaemonOutput(1, `[zotigod] ${chunk.toString()}`);
  });
  managedProcess.stderr.on("data", (chunk: Buffer) => {
    writeDaemonOutput(2, `[zotigod] ${chunk.toString()}`);
  });
  managedProcess.on("exit", (code, signal) => {
    console.warn(`[zotigo] managed zotigod exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    managedProcess = null;
  });

  await waitForZotigod();
}

export function managedZotigodBinaryPath(userDataPath: string): string {
  return path.join(userDataPath, "bin", process.platform === "win32" ? "zotigod.exe" : "zotigod");
}

function isLoopbackDaemon(url: URL): boolean {
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

async function buildManagedZotigod(workdir: string, binaryPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(binaryPath), { recursive: true });
  const temporaryPath = `${binaryPath}.tmp-${process.pid}`;
  const build = spawn("go", ["build", "-o", temporaryPath, "./cmd/zotigod"], {
    cwd: workdir,
    env: process.env,
    stdio: "pipe",
  });
  build.stdout.on("data", (chunk: Buffer) => writeDaemonOutput(1, `[zotigod build] ${chunk.toString()}`));
  build.stderr.on("data", (chunk: Buffer) => writeDaemonOutput(2, `[zotigod build] ${chunk.toString()}`));
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    build.once("error", reject);
    build.once("exit", (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0) {
    await fs.promises.rm(temporaryPath, { force: true });
    throw new Error(`go build exited code=${result.code ?? "null"} signal=${result.signal ?? "null"}`);
  }
  await fs.promises.rename(temporaryPath, binaryPath);
}

export function stopManagedZotigod(): void {
  if (!managedProcess || managedProcess.killed) {
    return;
  }
  managedProcess.kill("SIGTERM");
  managedProcess = null;
}

function resolveZotigoWorkdir(appPath: string): string | null {
  const configured = process.env.ZOTIGOD_WORKDIR?.trim();
  const candidates = configured ? [configured] : [path.resolve(appPath, "../zotigo")];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "cmd", "zotigod", "main.go"))) {
      return candidate;
    }
  }
  return null;
}

async function waitForZotigod(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await isZotigodHealthy()) {
      return;
    }
    await sleep(250);
  }
  console.warn("[zotigo] managed zotigod did not become healthy before timeout");
}

async function isZotigodHealthy(): Promise<boolean> {
  try {
    await health(AbortSignal.timeout(750));
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeDaemonOutput(fd: number, message: string): void {
  try {
    fs.writeSync(fd, message);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPIPE" && code !== "EBADF") {
      throw error;
    }
  }
}
