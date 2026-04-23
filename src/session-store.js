const fs = require("fs");
const os = require("os");
const path = require("path");

const SESSION_SOURCES = {
  codex: {
    id: "codex",
    label: "Codex",
    rootDir: path.join(os.homedir(), ".codex", "sessions"),
    extensions: [".jsonl"]
  },
  claude: {
    id: "claude",
    label: "Claude",
    rootDir: path.join(os.homedir(), ".claude", "projects"),
    extensions: [".jsonl"]
  }
};

function getSessionConfigDir(baseDir) {
  return path.join(baseDir, "sessions");
}

function getSessionAliasesPath(baseDir) {
  return path.join(getSessionConfigDir(baseDir), "aliases.json");
}

function ensureSessionStorage(baseDir) {
  const configDir = getSessionConfigDir(baseDir);
  fs.mkdirSync(configDir, { recursive: true });

  const aliasesPath = getSessionAliasesPath(baseDir);
  if (!fs.existsSync(aliasesPath)) {
    fs.writeFileSync(aliasesPath, "{}");
  }
}

function readJsonObject(filePath, fallback = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function readSessionAliases(baseDir) {
  ensureSessionStorage(baseDir);
  return readJsonObject(getSessionAliasesPath(baseDir), {});
}

function writeSessionAliases(baseDir, aliases) {
  ensureSessionStorage(baseDir);
  fs.writeFileSync(getSessionAliasesPath(baseDir), JSON.stringify(aliases, null, 2));
}

function createAliasKey(sourceId, sessionId) {
  return `${sourceId}:${sessionId}`;
}

function renameSession(baseDir, sourceId, sessionId, title) {
  const aliases = readSessionAliases(baseDir);
  const key = createAliasKey(sourceId, sessionId);
  const trimmedTitle = String(title || "").trim();

  if (!trimmedTitle) {
    delete aliases[key];
  } else {
    aliases[key] = trimmedTitle;
  }

  writeSessionAliases(baseDir, aliases);
  return aliases[key] || null;
}

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
        if (entry.name === "subagents") {
          continue;
        }
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

function safeStat(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function readSessionMeta(sourceId, filePath, stat) {
  return sourceId === "codex"
    ? readCodexSessionMeta(filePath, stat)
    : readClaudeSessionMeta(filePath, stat);
}

function readCodexSessionMeta(filePath, stat) {
  let sessionId = null;
  let cwd = null;
  let createdAt = stat ? stat.birthtimeMs : 0;
  let updatedAt = stat ? stat.mtimeMs : 0;
  let firstUserText = "";

  const lines = readHeadLines(filePath, 80);
  for (const line of lines) {
    const record = parseJsonLine(line);
    if (!record) {
      continue;
    }

    if (record.type === "session_meta" && record.payload && typeof record.payload === "object") {
      sessionId = sessionId || record.payload.id || null;
      cwd = cwd || record.payload.cwd || null;
      if (record.payload.timestamp) {
        const timestamp = Date.parse(record.payload.timestamp);
        if (Number.isFinite(timestamp)) {
          createdAt = timestamp;
        }
      }
    }

    if (!firstUserText && record.type === "event_msg" && record.payload && record.payload.type === "user_message") {
      firstUserText = String(record.payload.message || "").trim();
    }
  }

  if (!sessionId) {
    const basename = path.basename(filePath, ".jsonl");
    const match = basename.match(/([0-9a-f]{8,})$/i);
    sessionId = match ? match[1] : basename;
  }

  return {
    sessionId,
    cwd,
    createdAt,
    updatedAt,
    derivedTitle: buildDerivedTitle(firstUserText, cwd, sessionId)
  };
}

function readClaudeSessionMeta(filePath, stat) {
  let sessionId = null;
  let cwd = null;
  let createdAt = stat ? stat.birthtimeMs : 0;
  let updatedAt = stat ? stat.mtimeMs : 0;
  let displayTitle = "";
  let slug = "";
  let firstUserText = "";

  const lines = readHeadLines(filePath, 80);
  for (const line of lines) {
    const record = parseJsonLine(line);
    if (!record || typeof record !== "object") {
      continue;
    }

    sessionId = sessionId || record.sessionId || null;
    cwd = cwd || record.cwd || null;
    slug = slug || record.slug || "";

    if (record.timestamp) {
      const timestamp = Date.parse(record.timestamp);
      if (Number.isFinite(timestamp)) {
        createdAt = createdAt || timestamp;
      }
    }

    if (!displayTitle && record.message && typeof record.message === "object" && typeof record.message.name === "string") {
      displayTitle = record.message.name.trim();
    }

    if (!firstUserText && record.type === "user" && record.message && typeof record.message === "object") {
      firstUserText = extractClaudeUserText(record.message.content);
    }
  }

  if (!sessionId) {
    sessionId = path.basename(filePath, ".jsonl");
  }

  return {
    sessionId,
    cwd,
    createdAt,
    updatedAt,
    derivedTitle: buildDerivedTitle(displayTitle || firstUserText || slug, cwd, sessionId)
  };
}

function readHeadLines(filePath, maxLines) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return content.split(/\r?\n/).slice(0, maxLines);
  } catch {
    return [];
  }
}

function parseJsonLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractClaudeUserText(content) {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      if (typeof item.text === "string") {
        return item.text;
      }

      if (typeof item.content === "string") {
        return item.content;
      }

      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildDerivedTitle(rawTitle, cwd, sessionId) {
  const title = String(rawTitle || "")
    .replace(/\s+/g, " ")
    .trim();

  if (title) {
    return title.length > 60 ? `${title.slice(0, 57)}...` : title;
  }

  if (cwd) {
    return path.basename(cwd);
  }

  return sessionId;
}

function listSessions(baseDir) {
  ensureSessionStorage(baseDir);
  const aliases = readSessionAliases(baseDir);
  const sessions = [];

  for (const source of Object.values(SESSION_SOURCES)) {
    const files = listJsonlFiles(source.rootDir);
    for (const filePath of files) {
      const stat = safeStat(filePath);
      if (!stat) {
        continue;
      }

      const meta = readSessionMeta(source.id, filePath, stat);
      if (!meta || !meta.sessionId) {
        continue;
      }

      const customTitle = aliases[createAliasKey(source.id, meta.sessionId)] || null;
      sessions.push({
        source: source.id,
        sourceLabel: source.label,
        sessionId: meta.sessionId,
        filePath,
        cwd: meta.cwd,
        createdAt: meta.createdAt || stat.birthtimeMs || stat.mtimeMs || Date.now(),
        updatedAt: meta.updatedAt || stat.mtimeMs || Date.now(),
        customTitle,
        title: customTitle || meta.derivedTitle,
        derivedTitle: meta.derivedTitle
      });
    }
  }

  sessions.sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    return String(left.title).localeCompare(String(right.title));
  });

  return sessions;
}

module.exports = {
  SESSION_SOURCES,
  ensureSessionStorage,
  listSessions,
  readSessionAliases,
  renameSession
};
