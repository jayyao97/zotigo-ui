import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseUpdateStatus, type UpdateAction, type UpdateChannel } from "../shared/updates";

const execute = promisify(execFile);

function installation(component: "desktop" | "web", applicationPath: string) {
  let directory = fs.realpathSync(applicationPath);
  while (!fs.existsSync(path.join(directory, "UPDATE.json"))) {
    const parent = path.dirname(directory);
    if (directory === parent) throw new Error("This client is not an update-capable managed installation. Install it with the current installer first.");
    directory = parent;
  }
  let root = directory;
  while (path.basename(root) !== component && path.dirname(root) !== root) root = path.dirname(root);
  if (path.basename(root) !== component) throw new Error("Cannot identify the client installation.");
  return { directory, root };
}

export function acknowledgeDesktopUpdate(applicationPath: string): void {
  try {
    const { directory, root } = installation("desktop", applicationPath);
    const { version } = JSON.parse(fs.readFileSync(path.join(directory, "UPDATE.json"), "utf8"));
    const updates = path.join(path.dirname(root), "updates", "desktop");
    fs.mkdirSync(updates, { recursive: true, mode: 0o700 });
    const receipt = path.join(updates, "started.json");
    fs.writeFileSync(`${receipt}.tmp`, JSON.stringify({ version, pid: process.pid }), { mode: 0o600 });
    fs.renameSync(`${receipt}.tmp`, receipt);
  } catch { /* Source checkouts have no installed updater to acknowledge. */ }
}

export function createClientUpdater(component: "desktop" | "web", applicationPath: string, quit?: () => void) {
  return async (action: UpdateAction, channel?: UpdateChannel) => {
    const { root } = installation(component, applicationPath);
    const args = [action, "--prefix", path.dirname(root), "--component", component];
    if (channel) args.push("--channel", channel);
    const { stdout } = await execute(path.join(root, "current", "zotigo-update"), args, { timeout: 60_000, maxBuffer: 1024 * 1024 });
    const status = parseUpdateStatus(JSON.parse(stdout));
    if (action === "apply" && component === "desktop") setTimeout(() => quit?.(), 1000);
    return status;
  };
}
