export function fileBreadcrumbs(path: string, workspaceRoot?: string): string[] {
  const normalizedPath = path.replace(/\\/g, "/");
  const root = workspaceRoot?.replace(/\\/g, "/").replace(/\/+$/, "");
  if (root && normalizedPath.startsWith(`${root}/`)) {
    return [root.split("/").at(-1)!, ...normalizedPath.slice(root.length + 1).split("/").filter(Boolean)];
  }
  // A different root (including a symlink alias) must not invent a parent
  // relationship or discard directories. Display the actual path instead.
  return normalizedPath.split("/").filter(Boolean);
}
