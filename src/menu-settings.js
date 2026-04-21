const fs = require("fs");
const path = require("path");

function createDefaultMenuSettings() {
  return {
    showFiveHourUsageInMainMenu: false,
    showWeeklyUsageInMainMenu: false,
    showQuotaSourceInMainMenu: false,
    showUpdatedAtInMainMenu: false,
    showPetImageInMainMenu: false,
    replySourceMode: "claude"
  };
}

function getMenuSettingsPath(baseDir) {
  return path.join(baseDir, "menu-settings.json");
}

function normalizeMenuSettings(raw) {
  const fallback = createDefaultMenuSettings();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  return {
    showFiveHourUsageInMainMenu: raw.showFiveHourUsageInMainMenu === true,
    showWeeklyUsageInMainMenu: raw.showWeeklyUsageInMainMenu === true,
    showQuotaSourceInMainMenu: raw.showQuotaSourceInMainMenu === true,
    showUpdatedAtInMainMenu: raw.showUpdatedAtInMainMenu === true,
    showPetImageInMainMenu: raw.showPetImageInMainMenu === true,
    replySourceMode: normalizeReplySourceMode(raw.replySourceMode)
  };
}

function normalizeReplySourceMode(value) {
  if (value === "codex" || value === "both") {
    return value;
  }

  return "claude";
}

function ensureMenuSettings(baseDir) {
  const settingsPath = getMenuSettingsPath(baseDir);

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(createDefaultMenuSettings(), null, 2)
    );
  }
}

function readMenuSettings(baseDir) {
  ensureMenuSettings(baseDir);

  try {
    return normalizeMenuSettings(JSON.parse(fs.readFileSync(getMenuSettingsPath(baseDir), "utf8")));
  } catch {
    return createDefaultMenuSettings();
  }
}

function writeMenuSettings(baseDir, settings) {
  ensureMenuSettings(baseDir);
  fs.writeFileSync(
    getMenuSettingsPath(baseDir),
    JSON.stringify(normalizeMenuSettings(settings), null, 2)
  );
}

function updateMenuSettings(baseDir, patch) {
  const current = readMenuSettings(baseDir);
  const next = normalizeMenuSettings({
    ...current,
    ...patch
  });
  writeMenuSettings(baseDir, next);
  return next;
}

module.exports = {
  createDefaultMenuSettings,
  ensureMenuSettings,
  readMenuSettings,
  updateMenuSettings,
  normalizeReplySourceMode
};
