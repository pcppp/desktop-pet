const fs = require("fs");
const path = require("path");

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp"
]);

function createDefaultAppearance() {
  return {
    mode: "default",
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
    return {
      mode: "default",
      sourceImageLabel: null,
      sourceDataUrl: null,
      updatedAt: appearance.updatedAt
    };
  }

  const storedImagePath = getStoredImagePath(baseDir, appearance);
  if (!storedImagePath || !fs.existsSync(storedImagePath)) {
    return {
      mode: "default",
      sourceImageLabel: null,
      sourceDataUrl: null,
      updatedAt: appearance.updatedAt
    };
  }

  const buffer = fs.readFileSync(storedImagePath);
  const mimeType = getMimeTypeFromImagePath(storedImagePath);

  return {
    mode: "custom",
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

module.exports = {
  createDefaultAppearance,
  ensureAppearanceStorage,
  readAppearance,
  resetAppearance,
  saveCustomAppearance,
  toRendererAppearance
};
