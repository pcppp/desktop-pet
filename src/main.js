const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, dialog, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const {
  quotaPath,
  readQuota,
  updateQuotaCacheFromClaudeStatus
} = require("./quota-source");
const { createClaudeTranscriptWatcher } = require("./claude-transcript-watcher");
const { createCodexTranscriptWatcher } = require("./codex-transcript-watcher");
const {
  ensureAppearanceStorage,
  readAppearance,
  resetAppearance,
  saveCustomAppearance,
  toRendererAppearance
} = require("./pet-appearance");
const {
  ensureMenuSettings,
  readMenuSettings,
  updateMenuSettings,
  normalizeReplySourceMode,
  normalizeReplyBubbleSize
} = require("./menu-settings");
const {
  ensureSoundStorage,
  readSoundSettings,
  saveCustomSound,
  setSoundMode,
  updateSoundSettings,
  toRendererSoundSettings,
  describeSoundEntry
} = require("./pet-sound");

const WINDOW_SIZE = 220;
const dataDir = path.join(__dirname, "..", "data");
const eventPath = path.join(dataDir, "events.ndjson");
const distPath = path.join(__dirname, "..", "dist", "index.html");
const replyBubblePath = path.join(__dirname, "reply-bubble.html");
const PET_BUBBLE_ANCHOR_SIZE = 100;
const PET_BUBBLE_ANCHOR_TOP = 40;
const REPLY_BUBBLE_SIZE_MAP = {
  small: { width: 280, height: 116 },
  medium: { width: 340, height: 132 },
  large: { width: 420, height: 156 },
  xlarge: { width: 500, height: 188 }
};
const REPLY_BUBBLE_MARGIN = 8;
const REPLY_BUBBLE_TOP_OFFSET = 14;
const REPLY_BUBBLE_HIDE_DELAY_MS = 8000;
const REPLY_BUBBLE_HOVER_LEAVE_HIDE_DELAY_MS = 3000;

let mainWindow;
let replyBubbleWindow;
let tray;
let currentQuota = readQuota();
let eventWatcher;
let claudeTranscriptWatcher;
let codexTranscriptWatcher;
let quotaRefreshTimer;
let isQuotaRefreshing = false;
let currentAppearance;
let currentMenuSettings;
let currentSoundSettings;
let replyBubbleHideTimer;
let isReplyBubbleHovered = false;
let pendingReplyBubblePayload = null;

function ensureDataFiles() {
  fs.mkdirSync(dataDir, { recursive: true });
  ensureAppearanceStorage(dataDir);
  ensureMenuSettings(dataDir);
  ensureSoundStorage(dataDir);
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

function setMenuSetting(key, value) {
  currentMenuSettings = updateMenuSettings(dataDir, { [key]: value });
  if (key === "replySourceMode") {
    restartReplySourceWatchers();
  }
  if (key === "replyBubbleSize" && replyBubbleWindow && !replyBubbleWindow.isDestroyed()) {
    applyReplyBubblePosition(replyBubbleWindow);
  }
  refreshTray();
}

function getReplyBubbleSize() {
  const key = normalizeReplyBubbleSize(currentMenuSettings && currentMenuSettings.replyBubbleSize);
  return REPLY_BUBBLE_SIZE_MAP[key] || REPLY_BUBBLE_SIZE_MAP.medium;
}

function applySoundSettings(nextSoundSettings) {
  currentSoundSettings = nextSoundSettings;
  refreshTray();
  sendSoundSettings();
  return toRendererSoundSettings(dataDir, currentSoundSettings);
}

async function chooseCustomSound(soundKey) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a sound",
    properties: ["openFile"],
    filters: [
      { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "aac"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const nextSoundSettings = saveCustomSound(dataDir, soundKey, result.filePaths[0]);
  return applySoundSettings(nextSoundSettings);
}

function buildSoundMenuItem(label, soundKey, fallbackLabel) {
  return {
    label: `${label}: ${describeSoundEntry(currentSoundSettings[soundKey], fallbackLabel)}`,
    submenu: [
      {
        label: "Use Default",
        click: () => {
          applySoundSettings(setSoundMode(dataDir, soundKey, "default"));
        }
      },
      {
        label: "Choose Custom Audio",
        click: async () => {
          try {
            await chooseCustomSound(soundKey);
          } catch (error) {
            console.error(`Failed to choose ${soundKey} sound:`, error);
          }
        }
      },
      {
        label: "Mute",
        click: () => {
          applySoundSettings(setSoundMode(dataDir, soundKey, "silent"));
        }
      }
    ]
  };
}

function buildSoundMenu() {
  return [
    {
      label: "Mute All",
      type: "checkbox",
      checked: currentSoundSettings.masterMuted === true,
      click: (item) => {
        applySoundSettings(updateSoundSettings(dataDir, { masterMuted: item.checked }));
      }
    },
    {
      label: `Master Volume: ${currentSoundSettings.masterVolume}%`,
      submenu: [100, 85, 75, 60, 45, 30, 15, 0].map((volume) => ({
        label: `${volume}%`,
        type: "radio",
        checked: currentSoundSettings.masterVolume === volume,
        click: () => {
          applySoundSettings(updateSoundSettings(dataDir, { masterVolume: volume }));
        }
      }))
    },
    { type: "separator" },
    buildSoundMenuItem("Click", "click", "Default Click"),
    buildSoundMenuItem("Reply Finished", "replyFinished", "Default Reply"),
    buildSoundMenuItem("Drag", "drag", "Default Drag"),
    buildSoundMenuItem("Idle", "idle", "Default Idle")
  ];
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
  const settingsItems = [{ label: loadingLabel, enabled: false }];

  if (currentMenuSettings.showFiveHourUsageInMainMenu) {
    settingsItems.push({ label: `5h Usage: ${fiveHour}`, enabled: false });
  }

  if (currentMenuSettings.showWeeklyUsageInMainMenu) {
    settingsItems.push({ label: `Week Usage: ${weekly}`, enabled: false });
  }

  if (currentMenuSettings.showQuotaSourceInMainMenu) {
    settingsItems.push({ label: `Quota Source: ${source}`, enabled: false });
  }

  if (currentMenuSettings.showUpdatedAtInMainMenu) {
    settingsItems.push({ label: `Updated: ${currentQuota.updatedAt}`, enabled: false });
  }

  if (currentMenuSettings.showPetImageInMainMenu) {
    settingsItems.push({
      label: currentAppearance && currentAppearance.mode === "custom"
        ? `Pet Image: ${currentAppearance.sourceImageLabel || "Custom"}`
        : "Pet Image: Default Pixel Pet",
      enabled: false
    });
  }

  settingsItems.push({
    label: `Reply Source: ${normalizeReplySourceMode(currentMenuSettings.replySourceMode)}`,
    enabled: false
  });
  settingsItems.push({
    label: `Reply Bubble Size: ${normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize)}`,
    enabled: false
  });

  return Menu.buildFromTemplate([
    {
      label: currentQuota.fiveHour.menuTitle || "5小时 limit --",
      sublabel: currentQuota.fiveHour.menuSubtitle || "reset in Unknown",
      enabled: false
    },
    {
      label: currentQuota.weekly.menuTitle || "Weekly Limits --",
      sublabel: currentQuota.weekly.menuSubtitle || "Resets Unknown",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Settings",
      submenu: [
        ...settingsItems,
        { type: "separator" },
        {
          label: "Show 5h Usage In Settings",
          type: "checkbox",
          checked: currentMenuSettings.showFiveHourUsageInMainMenu,
          click: (item) => {
            setMenuSetting("showFiveHourUsageInMainMenu", item.checked);
          }
        },
        {
          label: "Show Weekly Usage In Settings",
          type: "checkbox",
          checked: currentMenuSettings.showWeeklyUsageInMainMenu,
          click: (item) => {
            setMenuSetting("showWeeklyUsageInMainMenu", item.checked);
          }
        },
        {
          label: "Show Quota Source In Settings",
          type: "checkbox",
          checked: currentMenuSettings.showQuotaSourceInMainMenu,
          click: (item) => {
            setMenuSetting("showQuotaSourceInMainMenu", item.checked);
          }
        },
        {
          label: "Show Updated Time In Settings",
          type: "checkbox",
          checked: currentMenuSettings.showUpdatedAtInMainMenu,
          click: (item) => {
            setMenuSetting("showUpdatedAtInMainMenu", item.checked);
          }
        },
        {
          label: "Show Pet Image In Settings",
          type: "checkbox",
          checked: currentMenuSettings.showPetImageInMainMenu,
          click: (item) => {
            setMenuSetting("showPetImageInMainMenu", item.checked);
          }
        },
        { type: "separator" },
        {
          label: "Reply Source",
          submenu: [
            {
              label: "Claude",
              type: "radio",
              checked: normalizeReplySourceMode(currentMenuSettings.replySourceMode) === "claude",
              click: () => {
                setMenuSetting("replySourceMode", "claude");
              }
            },
            {
              label: "Codex",
              type: "radio",
              checked: normalizeReplySourceMode(currentMenuSettings.replySourceMode) === "codex",
              click: () => {
                setMenuSetting("replySourceMode", "codex");
              }
            },
            {
              label: "Both",
              type: "radio",
              checked: normalizeReplySourceMode(currentMenuSettings.replySourceMode) === "both",
              click: () => {
                setMenuSetting("replySourceMode", "both");
              }
            }
          ]
        },
        {
          label: "Reply Bubble Size",
          submenu: [
            {
              label: "Small",
              type: "radio",
              checked: normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize) === "small",
              click: () => {
                setMenuSetting("replyBubbleSize", "small");
              }
            },
            {
              label: "Medium",
              type: "radio",
              checked: normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize) === "medium",
              click: () => {
                setMenuSetting("replyBubbleSize", "medium");
              }
            },
            {
              label: "Large",
              type: "radio",
              checked: normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize) === "large",
              click: () => {
                setMenuSetting("replyBubbleSize", "large");
              }
            },
            {
              label: "XLarge",
              type: "radio",
              checked: normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize) === "xlarge",
              click: () => {
                setMenuSetting("replyBubbleSize", "xlarge");
              }
            }
          ]
        },
        { type: "separator" },
        {
          label: "Choose Custom Pet Image",
          click: async () => {
            try {
              await chooseCustomAppearance();
            } catch (error) {
              console.error("Failed to choose custom pet image:", error);
            }
          }
        },
        {
          label: "Reset Pet Image",
          enabled: currentAppearance && currentAppearance.mode === "custom",
          click: () => {
            applyAppearance(resetAppearance(dataDir));
          }
        },
        { type: "separator" },
        {
          label: "Sound",
          submenu: buildSoundMenu()
        },
        { type: "separator" },
        {
          label: "Sync Claude Status",
          click: async () => {
            void syncQuotaFromClaudeStatus();
          }
        },
        {
          label: "Trigger Reply Finished",
          click: () => {
            sendAnimation("reply-finished");
          }
        }
      ]
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

function truncateReplyPreview(text) {
  const normalized = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split(/\n+/).filter(Boolean);
  if (lines.length <= 2) {
    return normalized;
  }

  return `${lines.slice(0, 2).join("\n")}...`;
}

function clearReplyBubbleHideTimer() {
  if (replyBubbleHideTimer) {
    clearTimeout(replyBubbleHideTimer);
    replyBubbleHideTimer = undefined;
  }
}

function scheduleReplyBubbleHide(delayMs = REPLY_BUBBLE_HIDE_DELAY_MS) {
  clearReplyBubbleHideTimer();
  replyBubbleHideTimer = setTimeout(() => {
    if (isReplyBubbleHovered) {
      return;
    }

    if (replyBubbleWindow && !replyBubbleWindow.isDestroyed()) {
      replyBubbleWindow.webContents.send("reply-bubble:hide");
      replyBubbleWindow.hide();
    }
  }, delayMs);
}

function ensureReplyBubbleWindow() {
  const size = getReplyBubbleSize();

  if (replyBubbleWindow && !replyBubbleWindow.isDestroyed()) {
    return replyBubbleWindow;
  }

  replyBubbleWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "reply-bubble-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  replyBubbleWindow.setAlwaysOnTop(true, "floating");
  replyBubbleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  replyBubbleWindow.setMenuBarVisibility(false);
  replyBubbleWindow.loadFile(replyBubblePath);
  replyBubbleWindow.webContents.on("did-finish-load", () => {
    if (!pendingReplyBubblePayload) {
      return;
    }

    replyBubbleWindow.webContents.send("reply-bubble:layout", {
      side: pendingReplyBubblePayload.side || "right"
    });
    replyBubbleWindow.webContents.send("reply-bubble:show", pendingReplyBubblePayload);
  });
  replyBubbleWindow.on("closed", () => {
    replyBubbleWindow = null;
  });

  return replyBubbleWindow;
}

function getPetBubbleAnchorBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      x: 160,
      y: 120,
      width: PET_BUBBLE_ANCHOR_SIZE,
      height: PET_BUBBLE_ANCHOR_SIZE
    };
  }

  const windowBounds = mainWindow.getBounds();
  return {
    x: windowBounds.x + Math.round((windowBounds.width - PET_BUBBLE_ANCHOR_SIZE) / 2),
    y: windowBounds.y + PET_BUBBLE_ANCHOR_TOP,
    width: PET_BUBBLE_ANCHOR_SIZE,
    height: PET_BUBBLE_ANCHOR_SIZE
  };
}

function getReplyBubblePosition() {
  const size = getReplyBubbleSize();
  const petBounds = getPetBubbleAnchorBounds();
  const petCenter = {
    x: petBounds.x + Math.round(petBounds.width / 2),
    y: petBounds.y + Math.round(petBounds.height / 2)
  };
  const display = screen.getDisplayNearestPoint(petCenter);
  const workArea = display.workArea;
  const rightSpace = workArea.x + workArea.width - (petBounds.x + petBounds.width) - REPLY_BUBBLE_MARGIN;
  const leftSpace = petBounds.x - workArea.x - REPLY_BUBBLE_MARGIN;
  const side = rightSpace >= size.width || rightSpace >= leftSpace
    ? "right"
    : "left";
  const desiredX = side === "right"
    ? petBounds.x + petBounds.width + REPLY_BUBBLE_MARGIN
    : petBounds.x - size.width - REPLY_BUBBLE_MARGIN;
  const desiredY = petBounds.y - REPLY_BUBBLE_TOP_OFFSET;

  const x = Math.min(
    workArea.x + workArea.width - size.width - REPLY_BUBBLE_MARGIN,
    Math.max(workArea.x + REPLY_BUBBLE_MARGIN, desiredX)
  );
  const y = Math.min(
    workArea.y + workArea.height - size.height - REPLY_BUBBLE_MARGIN,
    Math.max(workArea.y + REPLY_BUBBLE_MARGIN, desiredY)
  );

  return { x, y, side, width: size.width, height: size.height };
}

function applyReplyBubblePosition(bubble) {
  if (!bubble || bubble.isDestroyed()) {
    const size = getReplyBubbleSize();
    return { x: 160, y: 120, side: "right", width: size.width, height: size.height };
  }

  const placement = getReplyBubblePosition();
  bubble.setBounds({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height
  });

  if (pendingReplyBubblePayload) {
    pendingReplyBubblePayload = {
      ...pendingReplyBubblePayload,
      side: placement.side
    };
  }

  if (!bubble.webContents.isLoadingMainFrame()) {
    bubble.webContents.send("reply-bubble:layout", {
      side: placement.side
    });
  }

  return placement;
}

function showReplyBubble(text) {
  const fullText = String(text || "").trim();
  if (!fullText) {
    return;
  }

  const bubble = ensureReplyBubbleWindow();
  const previewText = truncateReplyPreview(fullText);

  isReplyBubbleHovered = false;
  pendingReplyBubblePayload = {
    previewText,
    fullText,
    side: "right"
  };
  const placement = applyReplyBubblePosition(bubble);
  pendingReplyBubblePayload.side = placement.side;
  bubble.showInactive();
  if (!bubble.webContents.isLoadingMainFrame()) {
    bubble.webContents.send("reply-bubble:show", pendingReplyBubblePayload);
  }
  scheduleReplyBubbleHide();
}

function handleReplyFinished(payload) {
  sendAnimation("reply-finished");
  showReplyBubble(payload && payload.replyText ? payload.replyText : "");
}

function stopReplySourceWatchers() {
  if (claudeTranscriptWatcher) {
    claudeTranscriptWatcher.close();
    claudeTranscriptWatcher = undefined;
  }

  if (codexTranscriptWatcher) {
    codexTranscriptWatcher.close();
    codexTranscriptWatcher = undefined;
  }
}

function restartReplySourceWatchers() {
  stopReplySourceWatchers();

  const mode = normalizeReplySourceMode(currentMenuSettings && currentMenuSettings.replySourceMode);

  if (mode === "claude" || mode === "both") {
    claudeTranscriptWatcher = createClaudeTranscriptWatcher({
      onReplyFinished: handleReplyFinished
    });
  }

  if (mode === "codex" || mode === "both") {
    codexTranscriptWatcher = createCodexTranscriptWatcher({
      onReplyFinished: handleReplyFinished
    });
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
      source: "cache"
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

function sendAppearance() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("pet:appearance", toRendererAppearance(dataDir, currentAppearance));
}

function sendSoundSettings() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("pet:sound-settings", toRendererSoundSettings(dataDir, currentSoundSettings));
}

function applyAppearance(nextAppearance) {
  currentAppearance = nextAppearance;
  refreshTray();
  sendAppearance();
  return toRendererAppearance(dataDir, currentAppearance);
}

async function chooseCustomAppearance() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a pet image",
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const nextAppearance = saveCustomAppearance(dataDir, result.filePaths[0]);
  return applyAppearance(nextAppearance);
}

function getContextMenuAnchor(anchor) {
  const fallback = {
    x: WINDOW_SIZE - 8,
    y: Math.round(WINDOW_SIZE / 2)
  };

  if (!anchor || typeof anchor !== "object") {
    return fallback;
  }

  const x = Number.isFinite(anchor.x) ? Math.round(anchor.x) : fallback.x;
  const y = Number.isFinite(anchor.y) ? Math.round(anchor.y) : fallback.y;

  return {
    x: Math.min(WINDOW_SIZE - 4, Math.max(0, x)),
    y: Math.min(WINDOW_SIZE - 4, Math.max(0, y))
  };
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

  mainWindow.webContents.on("did-finish-load", () => {
    sendAppearance();
    sendSoundSettings();
  });

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
  currentAppearance = readAppearance(dataDir);
  currentMenuSettings = readMenuSettings(dataDir);
  currentSoundSettings = readSoundSettings(dataDir);
  createWindow();
  createTray();
  watchEvents();
  restartReplySourceWatchers();
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
  stopReplySourceWatchers();
  if (quotaRefreshTimer) {
    clearInterval(quotaRefreshTimer);
  }
  if (replyBubbleWindow && !replyBubbleWindow.isDestroyed()) {
    replyBubbleWindow.close();
  }
  clearReplyBubbleHideTimer();
});

ipcMain.handle("pet:get-appearance", () => {
  return toRendererAppearance(dataDir, currentAppearance);
});

ipcMain.handle("pet:get-sound-settings", () => {
  return toRendererSoundSettings(dataDir, currentSoundSettings);
});

ipcMain.handle("pet:choose-custom-appearance", async () => {
  return chooseCustomAppearance();
});

ipcMain.handle("pet:choose-custom-sound", async (_event, soundKey) => {
  return chooseCustomSound(soundKey);
});

ipcMain.handle("pet:set-sound-mode", (_event, soundKey, mode) => {
  return applySoundSettings(setSoundMode(dataDir, soundKey, mode));
});

ipcMain.handle("pet:reset-appearance", () => {
  return applyAppearance(resetAppearance(dataDir));
});

ipcMain.on("pet:open-context-menu", (_event, anchor) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const menu = buildContextMenu();
  const position = getContextMenuAnchor(anchor);
  menu.popup({
    window: mainWindow,
    x: position.x,
    y: position.y
  });
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

  if (replyBubbleWindow && !replyBubbleWindow.isDestroyed() && replyBubbleWindow.isVisible()) {
    applyReplyBubblePosition(replyBubbleWindow);
  }
});

ipcMain.on("reply-bubble:hovered", (_event, payload) => {
  isReplyBubbleHovered = Boolean(payload && payload.hovered);

  if (isReplyBubbleHovered) {
    clearReplyBubbleHideTimer();
    return;
  }

  scheduleReplyBubbleHide(REPLY_BUBBLE_HOVER_LEAVE_HIDE_DELAY_MS);
});
