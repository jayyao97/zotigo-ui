import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function loadWebAccessToken(dataDirectory: string, configured?: string): string {
  if (configured !== undefined) {
    if (configured.length < 24) throw new Error("ZOTIGO_WEB_TOKEN must contain at least 24 characters.");
    return configured;
  }
  fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const tokenPath = path.join(dataDirectory, "access-token");
  let fd: number;
  let created = false;
  try {
    fd = fs.openSync(tokenPath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    fd = fs.openSync(tokenPath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error("Web access-token must be a regular private file with a single link.");
    fs.fchmodSync(fd, 0o600);
    if (created) {
      const token = randomBytes(32).toString("base64url");
      fs.writeFileSync(fd, `${token}\n`);
      return token;
    }
    const token = fs.readFileSync(fd, "utf8").trim();
    if (token.length < 24) throw new Error("Web access-token is invalid. Replace it with a valid token or remove the file to generate a new one.");
    return token;
  } finally {
    fs.closeSync(fd);
  }
}
