import { withHost } from "../backend/hosts";
import { configureDaemonImageAuth } from "./daemonImageAuth";
import { app, session, BrowserWindow, ipcMain, screen, shell, type Rectangle } from "electron";
import path from "node:path";
import { createApplicationService } from "../backend/applicationService";
import { closePreferencesStore, getWindowBoundsPreference, initializePreferencesStore, setWindowBoundsPreference } from "../backend/preferencesStore";
import { startManagedZotigodIfNeeded, stopManagedZotigod } from "./daemonManager";
import { resolveDevServerUrl } from "./devServerUrl";
import { startLogging } from "../backend/logging";

startLogging("desktop");
const devServerUrl = resolveDevServerUrl();
const appName = "Zotigo";
const defaultWindowWidth = 1280;
const defaultWindowHeight = 800;
const minimumWindowWidth = 1120;
const minimumWindowHeight = 680;

let mainWindow: BrowserWindow | null = null;
let applicationService: ReturnType<typeof createApplicationService>;
const hostApplications = new Map<string, ReturnType<typeof createApplicationService>>();

app.setName(appName);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

async function createMainWindow(): Promise<void> {
  const bounds = initialWindowBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: minimumWindowWidth,
    minHeight: minimumWindowHeight,
    title: appName,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#00000000",
    transparent: true,
    vibrancy: "sidebar",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("close", () => {
    applicationService?.dispose();
  for (const application of hostApplications.values()) application.dispose();
    if (mainWindow && !mainWindow.isDestroyed()) {
      setWindowBoundsPreference(mainWindow.getNormalBounds());
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("renderer_gone reason=%s exit_code=%d", details.reason, details.exitCode);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error("renderer_load_failed code=%d description=%s", code, description);
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === mainWindow?.webContents.getURL()) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
  });

  if (app.isPackaged || app.commandLine.hasSwitch("use-built-renderer")) {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  } else {
    await mainWindow.loadURL(devServerUrl);
  }
}

function initialWindowBounds(): Rectangle {
  const savedBounds = getWindowBoundsPreference();
  const displays = screen.getAllDisplays();
  const savedBoundsVisible = savedBounds && displays.some((display) => hasVisibleWindowArea(savedBounds, display.workArea));
  const display = savedBoundsVisible ? screen.getDisplayMatching(savedBounds) : screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = Math.min(Math.max(savedBounds?.width ?? defaultWindowWidth, minimumWindowWidth), workArea.width);
  const height = Math.min(Math.max(savedBounds?.height ?? defaultWindowHeight, minimumWindowHeight), workArea.height);

  if (!savedBoundsVisible || !savedBounds) {
    return {
      x: workArea.x + Math.floor((workArea.width - width) / 2),
      y: workArea.y + Math.floor((workArea.height - height) / 2),
      width,
      height,
    };
  }

  return {
    x: clamp(savedBounds.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(savedBounds.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
  };
}

function hasVisibleWindowArea(bounds: Rectangle, workArea: Rectangle): boolean {
  const visibleWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
  const visibleHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
  return visibleWidth >= 64 && visibleHeight >= 64;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  configureDaemonImageAuth(session.defaultSession);
  const userDataPath = app.getPath("userData");
  initializePreferencesStore(userDataPath);
  registerIpcHandlers();
  if (!app.isPackaged) {
    await startManagedZotigodIfNeeded(app.getAppPath(), userDataPath);
  }
  await createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  applicationService?.dispose();
  for (const application of hostApplications.values()) application.dispose();
  stopManagedZotigod();
});

app.on("will-quit", () => {
  closePreferencesStore();
});

function registerIpcHandlers(): void {
  const createForHost = (hostId: string) => createApplicationService({
    openExternal: (url) => shell.openExternal(url),
    openPath: async (path) => {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    },
    downloadImage: (url) => { mainWindow?.webContents.downloadURL(url); },
  }, (envelope) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("sessions:event", { ...envelope, hostId });
  });
  applicationService = createForHost("local");
  hostApplications.set("local", applicationService);
  for (const channel of applicationService.channels) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
        return { ok: false, error: "Untrusted application caller" };
      }
      const request = args[0] as { hostId?: unknown; args?: unknown };
      if (!request || typeof request.hostId !== "string" || !Array.isArray(request.args)) return { ok: false, error: "Invalid host request" };
      const hostId = request.hostId; const values = request.args;
      try {
        if (channel.startsWith("hosts:") && channel !== "hosts:inspect") return applicationService.invoke(channel, values);
        return withHost(hostId, () => {
          let application = hostApplications.get(hostId);
          if (!application) { application = createForHost(hostId); hostApplications.set(hostId, application); }
          return application.invoke(channel, values);
        });
      } catch { return { ok: false, error: "Host is no longer available." }; }
    });
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
