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
  APPEARANCE_PRESETS,
  MOTION_MODULES,
  ensureAppearanceStorage,
  getAppearancePreset,
  getMotionModule,
  readAppearance,
  resetAppearance,
  saveCustomAppearance,
  setMotionModule,
  setPresetAppearance,
  toRendererAppearance
} = require("./pet-appearance");
const {
  ensureMenuSettings,
  readMenuSettings,
  updateMenuSettings,
  normalizeReplySourceMode,
  normalizeReplyBubbleSize,
  normalizeTimeZonePreference
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
const CONTEXT_MENU_ESTIMATED_WIDTH = 210;
const CONTEXT_MENU_RIGHT_MARGIN = 10;
const CONTEXT_MENU_LEFT_MARGIN = 5;
const TIME_ZONE_OPTIONS = {
  system: {
    label: "System",
    labelZh: "跟随系统",
    timeZone: null
  },
  china: {
    label: "China",
    labelZh: "中国",
    timeZone: "Asia/Shanghai"
  },
  japan: {
    label: "Japan",
    labelZh: "日本",
    timeZone: "Asia/Tokyo"
  },
  uk: {
    label: "UK",
    labelZh: "英国",
    timeZone: "Europe/London"
  },
  "us-east": {
    label: "US East",
    labelZh: "美国东部",
    timeZone: "America/New_York"
  },
  "us-west": {
    label: "US West",
    labelZh: "美国西部",
    timeZone: "America/Los_Angeles"
  },
  utc: {
    label: "UTC",
    labelZh: "世界标准时",
    timeZone: "UTC"
  }
};

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
  if (key === "timeZonePreference") {
    currentQuota = readQuota();
    void syncQuotaFromClaudeStatus({ animate: false });
  }
  refreshTray();
}

function getReplyBubbleSize() {
  const key = normalizeReplyBubbleSize(currentMenuSettings && currentMenuSettings.replyBubbleSize);
  return REPLY_BUBBLE_SIZE_MAP[key] || REPLY_BUBBLE_SIZE_MAP.medium;
}

function isChineseUiEnabled() {
  return normalizeTimeZonePreference(currentMenuSettings && currentMenuSettings.timeZonePreference) === "china";
}

function getUiStrings() {
  if (isChineseUiEnabled()) {
    return {
      systemTimeZone: "系统时区",
      fiveHourTitle: (percentText) => `5小时限额 ${percentText}`,
      fiveHourFallbackTitle: "5小时限额 --",
      fiveHourSubtitleUnknown: "重置时间未知",
      fiveHourSubtitle: (hours, minutes) => `将在 ${hours} 小时 ${String(minutes).padStart(2, "0")} 分钟后重置`,
      fiveHourSubtitleZero: "将在 0 小时 00 分钟后重置",
      weeklyTitle: (percentText) => `每周限额 ${percentText}`,
      weeklyFallbackTitle: "每周限额 --",
      weeklySubtitleUnknown: "重置时间未知",
      weeklySubtitle: (text) => `将于 ${text} 重置`,
      sourceClaude: "Claude /status",
      sourceCache: "缓存回退",
      quotaSyncLoading: "额度同步中...",
      quotaSyncReady: "额度缓存就绪",
      settings: "设置",
      showFiveHourUsage: "在设置中显示 5 小时用量",
      showWeeklyUsage: "在设置中显示每周用量",
      showQuotaSource: "在设置中显示额度来源",
      showUpdatedAt: "在设置中显示更新时间",
      showPetImage: "在设置中显示桌宠形象",
      replySource: "回复来源",
      replySourceValue: {
        claude: "Claude",
        codex: "Codex",
        both: "同时监听"
      },
      replyBubbleSize: "气泡框大小",
      replyBubbleSizeValue: {
        small: "小",
        medium: "中",
        large: "大",
        xlarge: "超大"
      },
      timeZone: "时区",
      timeZoneValue: (label) => `时区：${label}`,
      themePack: "主题包",
      themePackValue: (label) => `主题包：${label}`,
      actionModule: "动作模组",
      actionModuleValue: (label) => `动作模组：${label}`,
      petImageCurrent: (label) => `桌宠形象：${label || "自定义"}`,
      petImageDefault: "桌宠形象：默认像素宠物",
      chooseCustomPetImage: "选择自定义桌宠图片",
      resetPetImage: "重置桌宠图片",
      sound: "声音",
      muteAll: "全部静音",
      masterVolume: (volume) => `总音量：${volume}%`,
      useDefault: "使用默认",
      chooseCustomAudio: "选择自定义音频",
      mute: "静音",
      soundItemLabel: (label, current) => `${label}：${current}`,
      soundLabels: {
        click: "点击",
        replyFinished: "回复完成",
        drag: "拖拽",
        idle: "待机"
      },
      soundFallbacks: {
        click: "默认点击音效",
        replyFinished: "默认完成音效",
        drag: "默认拖拽音效",
        idle: "默认待机音效"
      },
      syncClaudeStatus: "同步 Claude 状态",
      triggerReplyFinished: "触发回复完成",
      quit: "退出",
      fiveHourUsageSummary: (value) => `5 小时用量：${value}`,
      weeklyUsageSummary: (value) => `每周用量：${value}`,
      quotaSourceSummary: (value) => `额度来源：${value}`,
      updatedAtSummary: (value) => `更新时间：${value}`
    };
  }

  return {
    systemTimeZone: "System Time Zone",
    fiveHourTitle: (percentText) => `5小时 limit ${percentText}`,
    fiveHourFallbackTitle: "5小时 limit --",
    fiveHourSubtitleUnknown: "Resets in Unknown",
    fiveHourSubtitle: (hours, minutes) => `Resets in ${hours} hr ${String(minutes).padStart(2, "0")} min`,
    fiveHourSubtitleZero: "Resets in 0 hr 00 min",
    weeklyTitle: (percentText) => `Weekly Limits ${percentText}`,
    weeklyFallbackTitle: "Weekly Limits --",
    weeklySubtitleUnknown: "Resets Unknown",
    weeklySubtitle: (text) => `Resets ${text}`,
    sourceClaude: "Claude /status",
    sourceCache: "Cached fallback",
    quotaSyncLoading: "Quota Sync: Loading...",
    quotaSyncReady: "Quota Sync: Ready",
    settings: "Settings",
    showFiveHourUsage: "Show 5h Usage In Settings",
    showWeeklyUsage: "Show Weekly Usage In Settings",
    showQuotaSource: "Show Quota Source In Settings",
    showUpdatedAt: "Show Updated Time In Settings",
    showPetImage: "Show Pet Image In Settings",
    replySource: "Reply Source",
    replySourceValue: {
      claude: "Claude",
      codex: "Codex",
      both: "Both"
    },
    replyBubbleSize: "Reply Bubble Size",
    replyBubbleSizeValue: {
      small: "Small",
      medium: "Medium",
      large: "Large",
      xlarge: "XLarge"
    },
    timeZone: "Time Zone",
    timeZoneValue: (label) => `Time Zone: ${label}`,
    themePack: "Theme Pack",
    themePackValue: (label) => `Theme Pack: ${label}`,
    actionModule: "Action Module",
    actionModuleValue: (label) => `Action Module: ${label}`,
    petImageCurrent: (label) => `Pet Image: ${label || "Custom"}`,
    petImageDefault: "Pet Image: Default Pixel Pet",
    chooseCustomPetImage: "Choose Custom Pet Image",
    resetPetImage: "Reset Pet Image",
    sound: "Sound",
    muteAll: "Mute All",
    masterVolume: (volume) => `Master Volume: ${volume}%`,
    useDefault: "Use Default",
    chooseCustomAudio: "Choose Custom Audio",
    mute: "Mute",
    soundItemLabel: (label, current) => `${label}: ${current}`,
    soundLabels: {
      click: "Click",
      replyFinished: "Reply Finished",
      drag: "Drag",
      idle: "Idle"
    },
    soundFallbacks: {
      click: "Default Click",
      replyFinished: "Default Reply",
      drag: "Default Drag",
      idle: "Default Idle"
    },
    syncClaudeStatus: "Sync Claude Status",
    triggerReplyFinished: "Trigger Reply Finished",
    quit: "Quit",
    fiveHourUsageSummary: (value) => `5h Usage: ${value}`,
    weeklyUsageSummary: (value) => `Week Usage: ${value}`,
    quotaSourceSummary: (value) => `Quota Source: ${value}`,
    updatedAtSummary: (value) => `Updated: ${value}`
  };
}

function getSystemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getSelectedTimeZonePreference() {
  return normalizeTimeZonePreference(currentMenuSettings && currentMenuSettings.timeZonePreference);
}

function getConfiguredTimeZone() {
  const preference = getSelectedTimeZonePreference();
  const option = TIME_ZONE_OPTIONS[preference] || TIME_ZONE_OPTIONS.system;
  return option.timeZone || getSystemTimeZone();
}

function getTimeZoneOptionLabel(preference) {
  const option = TIME_ZONE_OPTIONS[preference] || TIME_ZONE_OPTIONS.system;
  return isChineseUiEnabled() ? option.labelZh : option.label;
}

function getAppearancePresetLabel(presetId) {
  const preset = getAppearancePreset(presetId);
  return isChineseUiEnabled() ? preset.labelZh : preset.label;
}

function getMotionModuleLabel(motionModule) {
  const moduleInfo = getMotionModule(motionModule);
  return isChineseUiEnabled() ? moduleInfo.labelZh : moduleInfo.label;
}

function detectResetTimeZone(resetsAt) {
  const match = String(resetsAt || "").match(/\(([A-Za-z_]+(?:\/[A-Za-z_]+)?)\)/);
  if (!match) {
    return null;
  }

  const zone = match[1];
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return null;
  }
}

function getTimeZoneDateParts(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = Number(part.value);
    }
    return accumulator;
  }, {});
}

function getNextCalendarDayParts(year, month, day) {
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  return {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate()
  };
}

function zonedDateTimeToUtcDate(timeZone, year, month, day, hour, minute) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actualParts = getTimeZoneDateParts(new Date(utcMs), timeZone);
    const desiredUtcComparable = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const actualUtcComparable = Date.UTC(
      actualParts.year,
      actualParts.month - 1,
      actualParts.day,
      actualParts.hour,
      actualParts.minute,
      0,
      0
    );
    const diffMs = desiredUtcComparable - actualUtcComparable;

    if (diffMs === 0) {
      break;
    }

    utcMs += diffMs;
  }

  return new Date(utcMs);
}

function describeSoundEntryLocalized(entry, fallbackDefaultLabel) {
  if (!isChineseUiEnabled()) {
    return describeSoundEntry(entry, fallbackDefaultLabel);
  }

  if (!entry || entry.mode === "silent") {
    return "已静音";
  }

  if (entry.mode === "custom") {
    return `自定义：${entry.sourceAudioLabel || "音频文件"}`;
  }

  return fallbackDefaultLabel;
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
  const strings = getUiStrings();
  return {
    label: strings.soundItemLabel(label, describeSoundEntryLocalized(currentSoundSettings[soundKey], fallbackLabel)),
    submenu: [
      {
        label: strings.useDefault,
        click: () => {
          applySoundSettings(setSoundMode(dataDir, soundKey, "default"));
        }
      },
      {
        label: strings.chooseCustomAudio,
        click: async () => {
          try {
            await chooseCustomSound(soundKey);
          } catch (error) {
            console.error(`Failed to choose ${soundKey} sound:`, error);
          }
        }
      },
      {
        label: strings.mute,
        click: () => {
          applySoundSettings(setSoundMode(dataDir, soundKey, "silent"));
        }
      }
    ]
  };
}

function buildSoundMenu() {
  const strings = getUiStrings();
  return [
    {
      label: strings.muteAll,
      type: "checkbox",
      checked: currentSoundSettings.masterMuted === true,
      click: (item) => {
        applySoundSettings(updateSoundSettings(dataDir, { masterMuted: item.checked }));
      }
    },
    {
      label: strings.masterVolume(currentSoundSettings.masterVolume),
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
    buildSoundMenuItem(strings.soundLabels.click, "click", strings.soundFallbacks.click),
    buildSoundMenuItem(strings.soundLabels.replyFinished, "replyFinished", strings.soundFallbacks.replyFinished),
    buildSoundMenuItem(strings.soundLabels.drag, "drag", strings.soundFallbacks.drag),
    buildSoundMenuItem(strings.soundLabels.idle, "idle", strings.soundFallbacks.idle)
  ];
}

function parseFiveHourResetTime(resetsAt) {
  const normalized = String(resetsAt || "")
    .replace(/^reset(?:s)?(?:\s+in)?\s+/i, "")
    .trim();

  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!timeMatch) {
    return null;
  }

  const now = new Date();
  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || "0");
  const period = timeMatch[3].toLowerCase();

  if (period === "pm" && hour !== 12) {
    hour += 12;
  } else if (period === "am" && hour === 12) {
    hour = 0;
  }

  const effectiveTimeZone = detectResetTimeZone(resetsAt) || getConfiguredTimeZone();
  const zonedNow = getTimeZoneDateParts(now, effectiveTimeZone);

  const year = zonedNow.year;
  const month = zonedNow.month;
  const day = zonedNow.day;
  const currentHour = zonedNow.hour;
  const currentMinute = zonedNow.minute;

  let targetYear = year;
  let targetMonth = month;
  let targetDay = day;

  if (hour < currentHour || (hour === currentHour && minute <= currentMinute)) {
    const nextDay = getNextCalendarDayParts(year, month, day);
    targetYear = nextDay.year;
    targetMonth = nextDay.month;
    targetDay = nextDay.day;
  }

  return zonedDateTimeToUtcDate(effectiveTimeZone, targetYear, targetMonth, targetDay, hour, minute);
}

function formatFiveHourResetSubtitle(resetsAt) {
  const strings = getUiStrings();
  const target = parseFiveHourResetTime(resetsAt);
  if (!target) {
    return strings.fiveHourSubtitleUnknown;
  }

  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) {
    return strings.fiveHourSubtitleZero;
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return strings.fiveHourSubtitle(hours, minutes);
}

function formatWeeklyResetSubtitle(menuSubtitle, resetsAt) {
  const strings = getUiStrings();
  if (typeof menuSubtitle === "string" && menuSubtitle.trim() && !isChineseUiEnabled()) {
    return menuSubtitle;
  }

  const normalized = String(resetsAt || "Unknown")
    .replace(/^reset(?:s)?\s+/i, "")
    .replace(/\(Asia\/Shanghai\)/gi, "")
    .replace(/\bat\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized ? strings.weeklySubtitle(normalized) : strings.weeklySubtitleUnknown;
}

function buildContextMenu() {
  currentQuota = readQuota();
  const strings = getUiStrings();
  const timeZonePreference = getSelectedTimeZonePreference();
  const replySourceMode = normalizeReplySourceMode(currentMenuSettings.replySourceMode);
  const replyBubbleSize = normalizeReplyBubbleSize(currentMenuSettings.replyBubbleSize);
  const appearanceRenderer = toRendererAppearance(dataDir, currentAppearance);
  const weekly = currentQuota.weekly.display;
  const fiveHour = currentQuota.fiveHour.display;
  const fiveHourSubtitle = formatFiveHourResetSubtitle(currentQuota.fiveHour.resetsAt);
  const weeklySubtitle = formatWeeklyResetSubtitle(
    currentQuota.weekly.menuSubtitle,
    currentQuota.weekly.resetsAt
  );
  const source = currentQuota.source === "claude-status"
    ? strings.sourceClaude
    : strings.sourceCache;
  const loadingLabel = isQuotaRefreshing
    ? strings.quotaSyncLoading
    : strings.quotaSyncReady;
  const settingsItems = [{ label: loadingLabel, enabled: false }];

  if (currentMenuSettings.showFiveHourUsageInMainMenu) {
    settingsItems.push({ label: strings.fiveHourUsageSummary(fiveHour), enabled: false });
  }

  if (currentMenuSettings.showWeeklyUsageInMainMenu) {
    settingsItems.push({ label: strings.weeklyUsageSummary(weekly), enabled: false });
  }

  if (currentMenuSettings.showQuotaSourceInMainMenu) {
    settingsItems.push({ label: strings.quotaSourceSummary(source), enabled: false });
  }

  if (currentMenuSettings.showUpdatedAtInMainMenu) {
    settingsItems.push({ label: strings.updatedAtSummary(currentQuota.updatedAt), enabled: false });
  }

  if (currentMenuSettings.showPetImageInMainMenu) {
    settingsItems.push({
      label: appearanceRenderer.mode === "custom"
        ? strings.petImageCurrent(appearanceRenderer.sourceImageLabel)
        : strings.petImageCurrent(getAppearancePresetLabel(appearanceRenderer.presetId)),
      enabled: false
    });
  }

  settingsItems.push({
    label: `${strings.replySource}: ${strings.replySourceValue[replySourceMode]}`,
    enabled: false
  });
  settingsItems.push({
    label: `${strings.replyBubbleSize}: ${strings.replyBubbleSizeValue[replyBubbleSize]}`,
    enabled: false
  });
  settingsItems.push({
    label: strings.timeZoneValue(
      timeZonePreference === "system"
        ? `${getTimeZoneOptionLabel("system")} (${getSystemTimeZone()})`
        : getTimeZoneOptionLabel(timeZonePreference)
    ),
    enabled: false
  });
  settingsItems.push({
    label: strings.themePackValue(
      appearanceRenderer.mode === "custom"
        ? (appearanceRenderer.sourceImageLabel || (isChineseUiEnabled() ? "自定义图片" : "Custom Image"))
        : getAppearancePresetLabel(appearanceRenderer.presetId)
    ),
    enabled: false
  });
  settingsItems.push({
    label: strings.actionModuleValue(getMotionModuleLabel(appearanceRenderer.motionModule)),
    enabled: false
  });

  return Menu.buildFromTemplate([
    {
      label: currentQuota.fiveHour.usedPercent != null
        ? strings.fiveHourTitle(`${currentQuota.fiveHour.usedPercent}%`)
        : strings.fiveHourFallbackTitle,
      sublabel: fiveHourSubtitle,
      enabled: false
    },
    {
      label: currentQuota.weekly.usedPercent != null
        ? strings.weeklyTitle(`${currentQuota.weekly.usedPercent}%`)
        : strings.weeklyFallbackTitle,
      sublabel: weeklySubtitle,
      enabled: false
    },
    { type: "separator" },
    {
      label: strings.settings,
      submenu: [
        ...settingsItems,
        { type: "separator" },
        {
          label: strings.showFiveHourUsage,
          type: "checkbox",
          checked: currentMenuSettings.showFiveHourUsageInMainMenu,
          click: (item) => {
            setMenuSetting("showFiveHourUsageInMainMenu", item.checked);
          }
        },
        {
          label: strings.showWeeklyUsage,
          type: "checkbox",
          checked: currentMenuSettings.showWeeklyUsageInMainMenu,
          click: (item) => {
            setMenuSetting("showWeeklyUsageInMainMenu", item.checked);
          }
        },
        {
          label: strings.showQuotaSource,
          type: "checkbox",
          checked: currentMenuSettings.showQuotaSourceInMainMenu,
          click: (item) => {
            setMenuSetting("showQuotaSourceInMainMenu", item.checked);
          }
        },
        {
          label: strings.showUpdatedAt,
          type: "checkbox",
          checked: currentMenuSettings.showUpdatedAtInMainMenu,
          click: (item) => {
            setMenuSetting("showUpdatedAtInMainMenu", item.checked);
          }
        },
        {
          label: strings.showPetImage,
          type: "checkbox",
          checked: currentMenuSettings.showPetImageInMainMenu,
          click: (item) => {
            setMenuSetting("showPetImageInMainMenu", item.checked);
          }
        },
        { type: "separator" },
        {
          label: strings.replySource,
          submenu: [
            {
              label: strings.replySourceValue.claude,
              type: "radio",
              checked: replySourceMode === "claude",
              click: () => {
                setMenuSetting("replySourceMode", "claude");
              }
            },
            {
              label: strings.replySourceValue.codex,
              type: "radio",
              checked: replySourceMode === "codex",
              click: () => {
                setMenuSetting("replySourceMode", "codex");
              }
            },
            {
              label: strings.replySourceValue.both,
              type: "radio",
              checked: replySourceMode === "both",
              click: () => {
                setMenuSetting("replySourceMode", "both");
              }
            }
          ]
        },
        {
          label: strings.replyBubbleSize,
          submenu: [
            {
              label: strings.replyBubbleSizeValue.small,
              type: "radio",
              checked: replyBubbleSize === "small",
              click: () => {
                setMenuSetting("replyBubbleSize", "small");
              }
            },
            {
              label: strings.replyBubbleSizeValue.medium,
              type: "radio",
              checked: replyBubbleSize === "medium",
              click: () => {
                setMenuSetting("replyBubbleSize", "medium");
              }
            },
            {
              label: strings.replyBubbleSizeValue.large,
              type: "radio",
              checked: replyBubbleSize === "large",
              click: () => {
                setMenuSetting("replyBubbleSize", "large");
              }
            },
            {
              label: strings.replyBubbleSizeValue.xlarge,
              type: "radio",
              checked: replyBubbleSize === "xlarge",
              click: () => {
                setMenuSetting("replyBubbleSize", "xlarge");
              }
            }
          ]
        },
        {
          label: strings.themePack,
          submenu: Object.values(APPEARANCE_PRESETS).map((preset) => ({
            label: isChineseUiEnabled() ? preset.labelZh : preset.label,
            type: "radio",
            checked: appearanceRenderer.mode !== "custom" && appearanceRenderer.presetId === preset.id,
            click: () => {
              applyAppearance(setPresetAppearance(dataDir, preset.id));
            }
          }))
        },
        {
          label: strings.actionModule,
          submenu: Object.values(MOTION_MODULES).map((moduleInfo) => ({
            label: isChineseUiEnabled() ? moduleInfo.labelZh : moduleInfo.label,
            type: "radio",
            checked: appearanceRenderer.motionModule === moduleInfo.id,
            click: () => {
              applyAppearance(setMotionModule(dataDir, moduleInfo.id));
            }
          }))
        },
        {
          label: strings.timeZone,
          submenu: Object.keys(TIME_ZONE_OPTIONS).map((preference) => ({
            label: getTimeZoneOptionLabel(preference),
            type: "radio",
            checked: timeZonePreference === preference,
            click: () => {
              setMenuSetting("timeZonePreference", preference);
            }
          }))
        },
        { type: "separator" },
        {
          label: strings.chooseCustomPetImage,
          click: async () => {
            try {
              await chooseCustomAppearance();
            } catch (error) {
              console.error("Failed to choose custom pet image:", error);
            }
          }
        },
        {
          label: strings.resetPetImage,
          enabled: currentAppearance && currentAppearance.mode === "custom",
          click: () => {
            applyAppearance(resetAppearance(dataDir));
          }
        },
        { type: "separator" },
        {
          label: strings.sound,
          submenu: buildSoundMenu()
        },
        { type: "separator" },
        {
          label: strings.syncClaudeStatus,
          click: async () => {
            void syncQuotaFromClaudeStatus();
          }
        },
        {
          label: strings.triggerReplyFinished,
          click: () => {
            sendAnimation("reply-finished");
          }
        }
      ]
    },
    { type: "separator" },
    {
      label: strings.quit,
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
    leftX: 12,
    rightX: WINDOW_SIZE - 8,
    y: Math.round(WINDOW_SIZE / 2)
  };

  if (!anchor || typeof anchor !== "object") {
    return {
      x: fallback.rightX,
      y: fallback.y
    };
  }

  const leftX = Number.isFinite(anchor.leftX) ? Math.round(anchor.leftX) : fallback.leftX;
  const rightX = Number.isFinite(anchor.rightX) ? Math.round(anchor.rightX) : fallback.rightX;
  const y = Number.isFinite(anchor.y) ? Math.round(anchor.y) : fallback.y;
  const clampedY = Math.min(WINDOW_SIZE - 4, Math.max(0, y));

  if (!mainWindow || mainWindow.isDestroyed()) {
    return {
      x: rightX,
      y: clampedY
    };
  }

  const windowBounds = mainWindow.getBounds();
  const anchorScreenPoint = {
    x: windowBounds.x + rightX,
    y: windowBounds.y + clampedY
  };
  const display = screen.getDisplayNearestPoint(anchorScreenPoint);
  const workArea = display.workArea;
  const rightSpace = workArea.x + workArea.width - (windowBounds.x + rightX);
  const leftSpace = (windowBounds.x + leftX) - workArea.x;
  const shouldOpenOnLeft = rightSpace < CONTEXT_MENU_ESTIMATED_WIDTH && leftSpace > rightSpace;
  const x = shouldOpenOnLeft
    ? leftX - CONTEXT_MENU_ESTIMATED_WIDTH - CONTEXT_MENU_LEFT_MARGIN
    : rightX + CONTEXT_MENU_RIGHT_MARGIN;

  return {
    x,
    y: clampedY
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
