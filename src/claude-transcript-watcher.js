const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_RESCAN_INTERVAL_MS = 15000;
const DEFAULT_RESCAN_DELAY_MS = 250;

function listJsonlFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries;

    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function isClaudeReplyFinishedRecord(record, options = {}) {
  if (!record || typeof record !== "object") {
    return false;
  }

  if (record.type !== "assistant") {
    return false;
  }

  if (record.isSidechain && options.watchSubagents !== true) {
    return false;
  }

  const message = record.message;
  if (!message || typeof message !== "object") {
    return false;
  }

  if (message.role !== "assistant") {
    return false;
  }

  return message.stop_reason === "end_turn";
}

function createReadStreamPromise(filePath, start, end) {
  return new Promise((resolve, reject) => {
    let chunk = "";
    const stream = fs.createReadStream(filePath, {
      encoding: "utf8",
      start,
      end
    });

    stream.on("data", (data) => {
      chunk += data;
    });

    stream.on("error", reject);
    stream.on("end", () => resolve(chunk));
  });
}

function createClaudeTranscriptWatcher(options = {}) {
  const rootDir = options.rootDir || path.join(os.homedir(), ".claude", "projects");
  const onReplyFinished = typeof options.onReplyFinished === "function"
    ? options.onReplyFinished
    : () => {};
  const onError = typeof options.onError === "function"
    ? options.onError
    : (error) => {
      console.error("Claude transcript watcher error:", error);
    };
  const trackedFiles = new Map();

  let rootWatcher;
  let rescanTimer;
  let scheduledRescanTimer;
  let isClosed = false;

  function ensureTrackedFile(filePath, startAtEnd, statOverride) {
    if (trackedFiles.has(filePath)) {
      return trackedFiles.get(filePath);
    }

    const stat = statOverride || getFileStat(filePath);

    if (!stat) {
      return null;
    }

    const state = {
      offset: startAtEnd ? stat.size : 0,
      queued: false,
      processing: false,
      remainder: "",
      lastKnownMtimeMs: startAtEnd ? stat.mtimeMs : 0,
      lastKnownSize: startAtEnd ? stat.size : 0
    };

    trackedFiles.set(filePath, state);
    return state;
  }

  function getFileStat(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null;
    }

    if (!stat.isFile()) {
      return null;
    }

    return stat;
  }

  function cleanupMissingFiles() {
    for (const filePath of trackedFiles.keys()) {
      if (!fs.existsSync(filePath)) {
        trackedFiles.delete(filePath);
      }
    }
  }

  function handleRecord(filePath, line, stat) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return;
    }

    let record;
    try {
      record = JSON.parse(trimmedLine);
    } catch {
      return;
    }

    if (!isClaudeReplyFinishedRecord(record, options)) {
      return;
    }

    onReplyFinished({
      filePath,
      record,
      fileMtimeMs: stat ? stat.mtimeMs : undefined
    });
  }

  async function processFile(filePath) {
    const state = trackedFiles.get(filePath);
    if (!state) {
      return;
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        trackedFiles.delete(filePath);
        return;
      }
      throw error;
    }

    if (!stat.isFile()) {
      trackedFiles.delete(filePath);
      return;
    }

    const fileChanged = stat.mtimeMs > state.lastKnownMtimeMs || stat.size !== state.lastKnownSize;
    let start = state.offset;
    if (stat.size < state.offset) {
      start = 0;
      state.offset = 0;
      state.remainder = "";
    }

    if (!fileChanged && stat.size === start) {
      return;
    }

    if (stat.size === start) {
      state.lastKnownMtimeMs = stat.mtimeMs;
      state.lastKnownSize = stat.size;
      return;
    }

    const chunk = await createReadStreamPromise(filePath, start, stat.size - 1);
    state.offset = stat.size;
    state.lastKnownMtimeMs = stat.mtimeMs;
    state.lastKnownSize = stat.size;

    const text = `${state.remainder}${chunk}`;
    const hasTrailingNewline = text.endsWith("\n");
    const lines = text.split(/\r?\n/);

    state.remainder = hasTrailingNewline ? "" : (lines.pop() || "");

    for (const line of lines) {
      handleRecord(filePath, line, stat);
    }
  }

  function queueProcessFile(filePath) {
    if (isClosed) {
      return;
    }

    const state = ensureTrackedFile(filePath, false);
    if (!state) {
      return;
    }

    if (state.processing) {
      state.queued = true;
      return;
    }

    state.processing = true;

    void processFile(filePath)
      .catch((error) => {
        onError(error);
      })
      .finally(() => {
        state.processing = false;

        if (!state.queued) {
          return;
        }

        state.queued = false;
        queueProcessFile(filePath);
      });
  }

  function scanForChangedFiles(startAtEnd) {
    for (const filePath of listJsonlFiles(rootDir)) {
      const isNewFile = !trackedFiles.has(filePath);
      const stat = getFileStat(filePath);
      const state = ensureTrackedFile(filePath, startAtEnd, stat);

      if (!state || startAtEnd) {
        continue;
      }

      if (isNewFile) {
        queueProcessFile(filePath);
        continue;
      }

      if (stat.mtimeMs > state.lastKnownMtimeMs || stat.size !== state.lastKnownSize) {
        queueProcessFile(filePath);
      }
    }

    cleanupMissingFiles();
  }

  function scheduleRescan(delayMs = DEFAULT_RESCAN_DELAY_MS) {
    if (isClosed || scheduledRescanTimer) {
      return;
    }

    scheduledRescanTimer = setTimeout(() => {
      scheduledRescanTimer = undefined;
      scanForChangedFiles(false);
    }, delayMs);
  }

  try {
    const stat = fs.statSync(rootDir);
    if (!stat.isDirectory()) {
      return {
        close() {}
      };
    }
  } catch {
    return {
      close() {}
    };
  }

  scanForChangedFiles(true);

  try {
    rootWatcher = fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
      if (isClosed) {
        return;
      }

      if (!filename) {
        scheduleRescan();
        return;
      }

      const relativePath = filename.toString();
      if (!relativePath.endsWith(".jsonl")) {
        if (eventType === "rename") {
          scheduleRescan();
        }
        return;
      }

      const filePath = path.join(rootDir, relativePath);

      if (eventType === "rename") {
        scheduleRescan();
      }

      queueProcessFile(filePath);
    });
  } catch {
    rootWatcher = undefined;
  }

  rescanTimer = setInterval(() => {
    scanForChangedFiles(false);
  }, options.rescanIntervalMs || DEFAULT_RESCAN_INTERVAL_MS);

  if (typeof rescanTimer.unref === "function") {
    rescanTimer.unref();
  }

  return {
    close() {
      isClosed = true;

      if (rootWatcher) {
        rootWatcher.close();
        rootWatcher = undefined;
      }

      if (rescanTimer) {
        clearInterval(rescanTimer);
        rescanTimer = undefined;
      }

      if (scheduledRescanTimer) {
        clearTimeout(scheduledRescanTimer);
        scheduledRescanTimer = undefined;
      }
    }
  };
}

module.exports = {
  createClaudeTranscriptWatcher,
  isClaudeReplyFinishedRecord
};
