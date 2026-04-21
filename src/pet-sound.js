const fs = require("fs");
const path = require("path");

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac"
]);

const SOUND_KEYS = ["click", "replyFinished", "drag", "idle"];
const DEFAULT_MASTER_VOLUME = 75;

function createDefaultSoundSettings() {
  return {
    masterMuted: false,
    masterVolume: DEFAULT_MASTER_VOLUME,
    click: createDefaultSoundEntry("default"),
    replyFinished: createDefaultSoundEntry("default"),
    drag: createDefaultSoundEntry("silent"),
    idle: createDefaultSoundEntry("silent"),
    updatedAt: new Date().toISOString()
  };
}

function createDefaultSoundEntry(mode) {
  return {
    mode,
    sourceAudioName: null,
    sourceAudioLabel: null
  };
}

function getSoundDir(baseDir) {
  return path.join(baseDir, "sound");
}

function getSoundConfigPath(baseDir) {
  return path.join(getSoundDir(baseDir), "sound-settings.json");
}

function getStoredAudioPath(baseDir, soundKey, entry) {
  if (!entry || entry.mode !== "custom" || !entry.sourceAudioName) {
    return null;
  }

  return path.join(getSoundDir(baseDir), `${soundKey}${path.extname(entry.sourceAudioName)}`);
}

function ensureSoundStorage(baseDir) {
  const soundDir = getSoundDir(baseDir);
  const configPath = getSoundConfigPath(baseDir);

  fs.mkdirSync(soundDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(createDefaultSoundSettings(), null, 2));
  }
}

function normalizeSoundEntry(rawEntry, fallbackMode) {
  if (!rawEntry || typeof rawEntry !== "object") {
    return createDefaultSoundEntry(fallbackMode);
  }

  const mode = rawEntry.mode === "custom" || rawEntry.mode === "silent" || rawEntry.mode === "default"
    ? rawEntry.mode
    : fallbackMode;

  if (mode !== "custom") {
    return createDefaultSoundEntry(mode);
  }

  if (typeof rawEntry.sourceAudioName !== "string" || !rawEntry.sourceAudioName) {
    return createDefaultSoundEntry(fallbackMode);
  }

  return {
    mode: "custom",
    sourceAudioName: path.basename(rawEntry.sourceAudioName),
    sourceAudioLabel: typeof rawEntry.sourceAudioLabel === "string" && rawEntry.sourceAudioLabel
      ? rawEntry.sourceAudioLabel
      : path.basename(rawEntry.sourceAudioName)
  };
}

function normalizeSoundSettings(raw) {
  const fallback = createDefaultSoundSettings();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  return {
    masterMuted: raw.masterMuted === true,
    masterVolume: normalizeMasterVolume(raw.masterVolume, fallback.masterVolume),
    click: normalizeSoundEntry(raw.click, "default"),
    replyFinished: normalizeSoundEntry(raw.replyFinished, "default"),
    drag: normalizeSoundEntry(raw.drag, "silent"),
    idle: normalizeSoundEntry(raw.idle, "silent"),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : fallback.updatedAt
  };
}

function normalizeMasterVolume(value, fallbackValue = DEFAULT_MASTER_VOLUME) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return fallbackValue;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

function writeSoundSettings(baseDir, soundSettings) {
  ensureSoundStorage(baseDir);
  fs.writeFileSync(
    getSoundConfigPath(baseDir),
    JSON.stringify(normalizeSoundSettings(soundSettings), null, 2)
  );
}

function removeStoredAudio(baseDir, soundKey, entry) {
  const storedAudioPath = getStoredAudioPath(baseDir, soundKey, entry);
  if (!storedAudioPath) {
    return;
  }

  try {
    fs.unlinkSync(storedAudioPath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function readSoundSettings(baseDir) {
  ensureSoundStorage(baseDir);

  let soundSettings;
  try {
    soundSettings = normalizeSoundSettings(JSON.parse(
      fs.readFileSync(getSoundConfigPath(baseDir), "utf8")
    ));
  } catch {
    soundSettings = createDefaultSoundSettings();
  }

  let hasFixes = false;
  const nextSettings = {
    ...soundSettings
  };

  for (const soundKey of SOUND_KEYS) {
    const entry = soundSettings[soundKey];
    if (entry.mode !== "custom") {
      continue;
    }

    const storedAudioPath = getStoredAudioPath(baseDir, soundKey, entry);
    if (storedAudioPath && fs.existsSync(storedAudioPath)) {
      continue;
    }

    hasFixes = true;
    nextSettings[soundKey] = createDefaultSoundEntry(soundKey === "click" || soundKey === "replyFinished"
      ? "default"
      : "silent");
  }

  if (hasFixes) {
    nextSettings.updatedAt = new Date().toISOString();
    writeSoundSettings(baseDir, nextSettings);
    return normalizeSoundSettings(nextSettings);
  }

  return soundSettings;
}

function getMimeTypeFromAudioPath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    default:
      throw new Error("Unsupported audio format");
  }
}

function toRendererSoundSettings(baseDir, soundSettingsInput) {
  const soundSettings = normalizeSoundSettings(soundSettingsInput || readSoundSettings(baseDir));
  const rendererSettings = {
    masterMuted: soundSettings.masterMuted,
    masterVolume: soundSettings.masterVolume,
    updatedAt: soundSettings.updatedAt
  };

  for (const soundKey of SOUND_KEYS) {
    const entry = soundSettings[soundKey];

    if (entry.mode !== "custom") {
      rendererSettings[soundKey] = {
        mode: entry.mode,
        sourceAudioLabel: null,
        sourceDataUrl: null
      };
      continue;
    }

    const storedAudioPath = getStoredAudioPath(baseDir, soundKey, entry);
    if (!storedAudioPath || !fs.existsSync(storedAudioPath)) {
      rendererSettings[soundKey] = {
        mode: soundKey === "click" || soundKey === "replyFinished" ? "default" : "silent",
        sourceAudioLabel: null,
        sourceDataUrl: null
      };
      continue;
    }

    const buffer = fs.readFileSync(storedAudioPath);
    const mimeType = getMimeTypeFromAudioPath(storedAudioPath);

    rendererSettings[soundKey] = {
      mode: "custom",
      sourceAudioLabel: entry.sourceAudioLabel,
      sourceDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`
    };
  }

  return rendererSettings;
}

function saveCustomSound(baseDir, soundKey, sourceFilePath) {
  if (!SOUND_KEYS.includes(soundKey)) {
    throw new Error("Unsupported sound target");
  }

  ensureSoundStorage(baseDir);

  const extension = path.extname(sourceFilePath).toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
    throw new Error("Please choose an MP3, WAV, OGG, M4A, or AAC audio file");
  }

  const currentSettings = readSoundSettings(baseDir);
  const previousEntry = currentSettings[soundKey];
  const targetName = `${soundKey}${extension}`;
  const targetPath = path.join(getSoundDir(baseDir), targetName);
  const sourcePath = path.resolve(sourceFilePath);
  const targetPathResolved = path.resolve(targetPath);

  if (
    previousEntry &&
    previousEntry.mode === "custom" &&
    path.resolve(getStoredAudioPath(baseDir, soundKey, previousEntry) || "") !== targetPathResolved
  ) {
    removeStoredAudio(baseDir, soundKey, previousEntry);
  }

  if (sourcePath !== targetPathResolved) {
    fs.copyFileSync(sourceFilePath, targetPath);
  }

  const nextSettings = {
    ...currentSettings,
    [soundKey]: {
      mode: "custom",
      sourceAudioName: targetName,
      sourceAudioLabel: path.basename(sourceFilePath)
    },
    updatedAt: new Date().toISOString()
  };

  writeSoundSettings(baseDir, nextSettings);
  return normalizeSoundSettings(nextSettings);
}

function setSoundMode(baseDir, soundKey, mode) {
  if (!SOUND_KEYS.includes(soundKey)) {
    throw new Error("Unsupported sound target");
  }

  if (!["default", "silent"].includes(mode)) {
    throw new Error("Unsupported sound mode");
  }

  const currentSettings = readSoundSettings(baseDir);
  const previousEntry = currentSettings[soundKey];

  if (previousEntry && previousEntry.mode === "custom") {
    removeStoredAudio(baseDir, soundKey, previousEntry);
  }

  const nextSettings = {
    ...currentSettings,
    [soundKey]: createDefaultSoundEntry(mode),
    updatedAt: new Date().toISOString()
  };

  writeSoundSettings(baseDir, nextSettings);
  return normalizeSoundSettings(nextSettings);
}

function updateSoundSettings(baseDir, patch) {
  const currentSettings = readSoundSettings(baseDir);
  const nextSettings = normalizeSoundSettings({
    ...currentSettings,
    ...patch,
    updatedAt: new Date().toISOString()
  });

  writeSoundSettings(baseDir, nextSettings);
  return nextSettings;
}

function describeSoundEntry(entry, fallbackDefaultLabel) {
  if (!entry || entry.mode === "silent") {
    return "Muted";
  }

  if (entry.mode === "custom") {
    return `Custom: ${entry.sourceAudioLabel || "Audio file"}`;
  }

  return fallbackDefaultLabel;
}

module.exports = {
  SOUND_KEYS,
  createDefaultSoundSettings,
  ensureSoundStorage,
  readSoundSettings,
  saveCustomSound,
  setSoundMode,
  updateSoundSettings,
  toRendererSoundSettings,
  describeSoundEntry
};
