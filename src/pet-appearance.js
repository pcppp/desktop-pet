const fs = require("fs");
const path = require("path");

const builtInPetImageDir = path.join(__dirname, "assets", "pets");
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp"
]);

const APPEARANCE_PRESETS = {
  default: {
    id: "default",
    label: "Default Pixel Pet",
    labelZh: "默认像素宠物"
  },
  sakura: {
    id: "sakura",
    label: "Sakura Girlfriend",
    labelZh: "樱花女友"
  },
  mint: {
    id: "mint",
    label: "Mint Junior",
    labelZh: "薄荷学妹"
  },
  moonlight: {
    id: "moonlight",
    label: "Moonlight Maid",
    labelZh: "月夜女仆"
  },
  shygirl: {
    id: "shygirl",
    label: "Shy Knees Girl",
    labelZh: "抱膝害羞少女",
    builtInImageName: "shy-knees-girl.png"
  }
};

const MOTION_MODULES = {
  sweet: {
    id: "sweet",
    label: "Sweet",
    labelZh: "甜妹"
  },
  peppy: {
    id: "peppy",
    label: "Peppy",
    labelZh: "元气"
  },
  shy: {
    id: "shy",
    label: "Shy",
    labelZh: "害羞"
  }
};

function normalizePresetId(value) {
  if (typeof value === "string" && APPEARANCE_PRESETS[value]) {
    return value;
  }

  return "default";
}

function normalizeMotionModule(value) {
  if (typeof value === "string" && MOTION_MODULES[value]) {
    return value;
  }

  return "sweet";
}

function getAppearancePreset(presetId) {
  return APPEARANCE_PRESETS[normalizePresetId(presetId)];
}

function getMotionModule(motionModule) {
  return MOTION_MODULES[normalizeMotionModule(motionModule)];
}

function createDefaultAppearance() {
  return {
    mode: "preset",
    presetId: "shygirl",
    motionModule: "sweet",
    sourceImageName: null,
    sourceImageLabel: null,
    updatedAt: new Date().toISOString()
  };
}

function getAppearanceDir(baseDir) {
  return path.join(baseDir, "appearance");
}

function getAppearanceConfigPath(baseDir) {
  return path.join(getAppearanceDir(baseDir), "appearance.json");
}

function getStoredImagePath(baseDir, appearance) {
  if (!appearance || appearance.mode !== "custom" || !appearance.sourceImageName) {
    return null;
  }

  return path.join(getAppearanceDir(baseDir), appearance.sourceImageName);
}

function ensureAppearanceStorage(baseDir) {
  const appearanceDir = getAppearanceDir(baseDir);
  const configPath = getAppearanceConfigPath(baseDir);

  fs.mkdirSync(appearanceDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(createDefaultAppearance(), null, 2));
  }
}

function normalizeAppearance(raw) {
  const fallback = createDefaultAppearance();

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const updatedAt = typeof raw.updatedAt === "string"
    ? raw.updatedAt
    : fallback.updatedAt;

  if (raw.mode !== "custom") {
    return {
      ...fallback,
      mode: "preset",
      presetId: normalizePresetId(raw.presetId),
      motionModule: normalizeMotionModule(raw.motionModule),
      updatedAt
    };
  }

  if (typeof raw.sourceImageName !== "string" || !raw.sourceImageName) {
    return {
      ...fallback,
      updatedAt
    };
  }

  return {
    mode: "custom",
    presetId: null,
    motionModule: normalizeMotionModule(raw.motionModule),
    sourceImageName: path.basename(raw.sourceImageName),
    sourceImageLabel: typeof raw.sourceImageLabel === "string" && raw.sourceImageLabel
      ? raw.sourceImageLabel
      : path.basename(raw.sourceImageName),
    updatedAt
  };
}

function writeAppearance(baseDir, appearance) {
  ensureAppearanceStorage(baseDir);
  fs.writeFileSync(
    getAppearanceConfigPath(baseDir),
    JSON.stringify(normalizeAppearance(appearance), null, 2)
  );
}

function readAppearance(baseDir) {
  ensureAppearanceStorage(baseDir);

  let appearance;
  try {
    appearance = normalizeAppearance(JSON.parse(
      fs.readFileSync(getAppearanceConfigPath(baseDir), "utf8")
    ));
  } catch {
    appearance = createDefaultAppearance();
  }

  if (appearance.mode !== "custom") {
    return appearance;
  }

  const storedImagePath = getStoredImagePath(baseDir, appearance);
  if (storedImagePath && fs.existsSync(storedImagePath)) {
    return appearance;
  }

  const fallback = {
    ...createDefaultAppearance(),
    motionModule: appearance.motionModule,
    updatedAt: appearance.updatedAt
  };
  writeAppearance(baseDir, fallback);
  return fallback;
}

function getMimeTypeFromImagePath(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      throw new Error("Unsupported image format");
  }
}

function getBuiltInPresetImagePath(presetId) {
  const preset = getAppearancePreset(presetId);
  if (!preset.builtInImageName) {
    return null;
  }

  return path.join(builtInPetImageDir, preset.builtInImageName);
}

function toRendererPresetAppearance(appearance) {
  const presetId = normalizePresetId(appearance.presetId);
  const preset = getAppearancePreset(presetId);
  const builtInImagePath = getBuiltInPresetImagePath(presetId);

  if (builtInImagePath && fs.existsSync(builtInImagePath)) {
    const buffer = fs.readFileSync(builtInImagePath);
    const mimeType = getMimeTypeFromImagePath(builtInImagePath);

    return {
      mode: "preset",
      renderMode: "image",
      presetId,
      presetLabel: preset.label,
      motionModule: normalizeMotionModule(appearance.motionModule),
      motionModuleLabel: getMotionModule(appearance.motionModule).label,
      sourceImageLabel: preset.label,
      sourceDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      updatedAt: appearance.updatedAt
    };
  }

  return {
    mode: "preset",
    renderMode: "pixel",
    presetId,
    presetLabel: preset.label,
    motionModule: normalizeMotionModule(appearance.motionModule),
    motionModuleLabel: getMotionModule(appearance.motionModule).label,
    sourceImageLabel: null,
    sourceDataUrl: null,
    updatedAt: appearance.updatedAt
  };
}

function removeStoredImage(baseDir, appearance) {
  const storedImagePath = getStoredImagePath(baseDir, appearance);

  if (!storedImagePath) {
    return;
  }

  try {
    fs.unlinkSync(storedImagePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function toRendererAppearance(baseDir, appearanceInput) {
  const appearance = normalizeAppearance(appearanceInput || readAppearance(baseDir));

  if (appearance.mode !== "custom") {
    return toRendererPresetAppearance(appearance);
  }

  const storedImagePath = getStoredImagePath(baseDir, appearance);
  if (!storedImagePath || !fs.existsSync(storedImagePath)) {
    return toRendererPresetAppearance({
      mode: "preset",
      presetId: "shygirl",
      motionModule: appearance.motionModule,
      updatedAt: appearance.updatedAt
    });
  }

  const buffer = fs.readFileSync(storedImagePath);
  const mimeType = getMimeTypeFromImagePath(storedImagePath);

  return {
    mode: "custom",
    renderMode: "image",
    presetId: null,
    presetLabel: null,
    motionModule: normalizeMotionModule(appearance.motionModule),
    motionModuleLabel: getMotionModule(appearance.motionModule).label,
    sourceImageLabel: appearance.sourceImageLabel,
    sourceDataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    updatedAt: appearance.updatedAt
  };
}

function saveCustomAppearance(baseDir, sourceFilePath) {
  ensureAppearanceStorage(baseDir);

  const extension = path.extname(sourceFilePath).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error("Please choose a PNG, JPG, WEBP, GIF, or BMP image");
  }

  const previousAppearance = readAppearance(baseDir);
  const targetName = `custom-pet${extension}`;
  const targetPath = path.join(getAppearanceDir(baseDir), targetName);
  const sourcePath = path.resolve(sourceFilePath);
  const targetPathResolved = path.resolve(targetPath);

  if (
    previousAppearance.mode === "custom" &&
    path.resolve(getStoredImagePath(baseDir, previousAppearance) || "") !== targetPathResolved
  ) {
    removeStoredImage(baseDir, previousAppearance);
  }

  if (sourcePath !== targetPathResolved) {
    fs.copyFileSync(sourceFilePath, targetPath);
  }

  const nextAppearance = {
    mode: "custom",
    presetId: null,
    motionModule: previousAppearance.motionModule,
    sourceImageName: targetName,
    sourceImageLabel: path.basename(sourceFilePath),
    updatedAt: new Date().toISOString()
  };

  writeAppearance(baseDir, nextAppearance);
  return normalizeAppearance(nextAppearance);
}

function resetAppearance(baseDir) {
  const previousAppearance = readAppearance(baseDir);

  if (previousAppearance.mode === "custom") {
    removeStoredImage(baseDir, previousAppearance);
  }

  const nextAppearance = {
    ...createDefaultAppearance(),
    updatedAt: new Date().toISOString()
  };

  writeAppearance(baseDir, nextAppearance);
  return nextAppearance;
}

function setPresetAppearance(baseDir, presetId) {
  const previousAppearance = readAppearance(baseDir);

  if (previousAppearance.mode === "custom") {
    removeStoredImage(baseDir, previousAppearance);
  }

  const nextAppearance = {
    mode: "preset",
    presetId: normalizePresetId(presetId),
    motionModule: previousAppearance.motionModule,
    sourceImageName: null,
    sourceImageLabel: null,
    updatedAt: new Date().toISOString()
  };

  writeAppearance(baseDir, nextAppearance);
  return nextAppearance;
}

function setMotionModule(baseDir, motionModule) {
  const previousAppearance = readAppearance(baseDir);
  const nextAppearance = {
    ...previousAppearance,
    motionModule: normalizeMotionModule(motionModule),
    updatedAt: new Date().toISOString()
  };

  writeAppearance(baseDir, nextAppearance);
  return normalizeAppearance(nextAppearance);
}

module.exports = {
  APPEARANCE_PRESETS,
  MOTION_MODULES,
  createDefaultAppearance,
  ensureAppearanceStorage,
  getAppearancePreset,
  getMotionModule,
  readAppearance,
  resetAppearance,
  saveCustomAppearance,
  setMotionModule,
  setPresetAppearance,
  toRendererAppearance
};
