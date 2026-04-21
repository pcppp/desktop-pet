const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const {
  quotaPath,
  readQuota,
  updateQuotaCacheFromClaudeStatus
} = require("./quota-source");

const WINDOW_SIZE = 220;
const dataDir = path.join(__dirname, "..", "data");
const eventPath = path.join(dataDir, "events.ndjson");
const distPath = path.join(__dirname, "..", "dist", "index.html");

let mainWindow;
let tray;
let currentQuota = readQuota();
let eventWatcher;
let quotaRefreshTimer;
let isQuotaRefreshing = false;

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(quotaPath)) {
    fs.writeFileSync(
      quotaPath,
      JSON.stringify(
        {
          source: "demo-cache",
          weekly: {
            display: "16% used",
            usedPercent: 16,
            resetsAt: "Apr 27 at 2pm (Asia/Shanghai)"
          },
          fiveHour: {
            display: "25% used",
            usedPercent: 25,
            resetsAt: "4pm (Asia/Shanghai)"
          },
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )
    );
  }
  if (!fs.existsSync(eventPath)) {
    fs.writeFileSync(eventPath, "");
  }
}

function buildContextMenu() {
  const weekly = currentQuota.weekly.display;
  const fiveHour = currentQuota.fiveHour.display;
  const source = currentQuota.source === "claude-status"
    ? "Claude /status"
    : "Cached fallback";
  const loadingLabel = isQuotaRefreshing
    ? "Quota Sync: Loading..."
    : "Quota Sync: Ready";

  return Menu.buildFromTemplate([
    { label: loadingLabel, enabled: false },
    { label: `5h Quota: ${fiveHour}`, enabled: false },
    { label: `5h Reset: ${currentQuota.fiveHour.resetsAt}`, enabled: false },
    { label: `Week Quota: ${weekly}`, enabled: false },
    { label: `Week Reset: ${currentQuota.weekly.resetsAt}`, enabled: false },
    { label: `Quota Source: ${source}`, enabled: false },
    { label: `Updated: ${currentQuota.updatedAt}`, enabled: false },
    currentQuota.error
      ? { label: `Last Sync Error: ${currentQuota.error}`, enabled: false }
      : { label: "Last Sync Error: none", enabled: false },
    { type: "separator" },
    {
      label: "Trigger Reply Finished",
      click: () => {
        sendAnimation("reply-finished");
      }
    },
    {
      label: "Sync Claude Status",
      click: async () => {
        void syncQuotaFromClaudeStatus();
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);
}

function refreshTray() {
  if (tray) {
    tray.setContextMenu(buildContextMenu());
  }
}

async function syncQuotaFromClaudeStatus(options = {}) {
  if (isQuotaRefreshing) {
    return currentQuota;
  }

  isQuotaRefreshing = true;
  refreshTray();

  try {
    currentQuota = await updateQuotaCacheFromClaudeStatus({
      cwd: path.join(__dirname, "..")
    });
  } catch (error) {
    currentQuota = {
      ...readQuota(),
      source: "cache",
      error: error.message
    };
  } finally {
    isQuotaRefreshing = false;
  }

  refreshTray();

  if (options.animate !== false) {
    sendAnimation("quota-updated");
  }

  return currentQuota;
}

function sendAnimation(trigger) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("pet:trigger", {
    trigger,
    quota: currentQuota
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(distPath);
  }
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setPosition(120, 120);
  mainWindow.show();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Renderer failed to load:", errorCode, errorDescription);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details);
  });
}

function createTray() {
  const image = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0JTkAAAAASUVORK5CYII="
  );
  tray = new Tray(image);
  tray.setToolTip("Claude-like Desktop Pet MVP");
  refreshTray();

  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function watchEvents() {
  let lastSize = 0;

  try {
    lastSize = fs.statSync(eventPath).size;
  } catch {
    lastSize = 0;
  }

  const onChange = () => {
    let stat;
    try {
      stat = fs.statSync(eventPath);
    } catch {
      return;
    }

    if (stat.size < lastSize) {
      lastSize = stat.size;
      return;
    }

    if (stat.size === lastSize) {
      return;
    }

    const stream = fs.createReadStream(eventPath, {
      encoding: "utf8",
      start: lastSize,
      end: stat.size
    });

    let chunk = "";
    stream.on("data", (data) => {
      chunk += data;
    });
    stream.on("end", () => {
      lastSize = stat.size;
      const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        try {
          const payload = JSON.parse(line);
          if (payload.type === "reply-finished") {
            sendAnimation("reply-finished");
          }
          if (payload.type === "quota-updated") {
            currentQuota = readQuota();
            refreshTray();
            sendAnimation("quota-updated");
          }
        } catch {
          // Ignore malformed lines in the MVP bridge file.
        }
      }
    });
  };

  eventWatcher = fs.watch(eventPath, onChange);
}

app.whenReady().then(() => {
  ensureDataFiles();
  createWindow();
  createTray();
  watchEvents();
  setTimeout(() => {
    void syncQuotaFromClaudeStatus({ animate: false });
  }, 1500);
  quotaRefreshTimer = setInterval(() => {
    void syncQuotaFromClaudeStatus({ animate: false });
  }, 10 * 60 * 1000);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

app.on("window-all-closed", () => {
  // Keep running in tray for desktop pet behavior.
});

app.on("before-quit", () => {
  if (eventWatcher) {
    eventWatcher.close();
  }
  if (quotaRefreshTimer) {
    clearInterval(quotaRefreshTimer);
  }
});

ipcMain.on("pet:open-context-menu", () => {
  const menu = buildContextMenu();
  menu.popup({ window: mainWindow });
  void syncQuotaFromClaudeStatus({ animate: false });
});

ipcMain.on("pet:drag-move", (_event, offset) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(
    Math.round(x + offset.deltaX),
    Math.round(y + offset.deltaY)
  );
});
