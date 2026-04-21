const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const dataDir = path.join(__dirname, "..", "data");
const quotaPath = path.join(dataDir, "quota.json");

function createEmptyQuota() {
  return {
    source: "unavailable",
    weekly: {
      label: "Current week (all models)",
      display: "Unavailable",
      usedPercent: null,
      resetsAt: "Unknown"
    },
    fiveHour: {
      label: "Current session",
      display: "Unavailable",
      usedPercent: null,
      resetsAt: "Unknown"
    },
    updatedAt: "unknown"
  };
}

function normalizeBucket(bucket, fallbackLabel) {
  if (!bucket || typeof bucket !== "object") {
    return {
      label: fallbackLabel,
      display: "Unavailable",
      usedPercent: null,
      resetsAt: "Unknown"
    };
  }

  if (typeof bucket.display === "string") {
    return {
      label: typeof bucket.label === "string" ? bucket.label : fallbackLabel,
      display: bucket.display,
      usedPercent: Number.isFinite(bucket.usedPercent) ? bucket.usedPercent : null,
      resetsAt: typeof bucket.resetsAt === "string" ? bucket.resetsAt : "Unknown"
    };
  }

  if (Number.isFinite(bucket.usedPercent)) {
    return {
      label: typeof bucket.label === "string" ? bucket.label : fallbackLabel,
      display: `${bucket.usedPercent}% used`,
      usedPercent: bucket.usedPercent,
      resetsAt: typeof bucket.resetsAt === "string" ? bucket.resetsAt : "Unknown"
    };
  }

  if (Number.isFinite(bucket.used) && Number.isFinite(bucket.limit)) {
    const usedPercent = bucket.limit > 0
      ? Math.round((bucket.used / bucket.limit) * 100)
      : null;

    return {
      label: typeof bucket.label === "string" ? bucket.label : fallbackLabel,
      display: `${bucket.used}/${bucket.limit}`,
      usedPercent,
      resetsAt: typeof bucket.resetsAt === "string" ? bucket.resetsAt : "Unknown"
    };
  }

  return {
    label: fallbackLabel,
    display: "Unavailable",
    usedPercent: null,
    resetsAt: "Unknown"
  };
}

function normalizeQuota(raw) {
  const empty = createEmptyQuota();

  if (!raw || typeof raw !== "object") {
    return empty;
  }

  return {
    source: typeof raw.source === "string" ? raw.source : empty.source,
    weekly: normalizeBucket(raw.weekly, empty.weekly.label),
    fiveHour: normalizeBucket(raw.fiveHour, empty.fiveHour.label),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : empty.updatedAt,
    error: typeof raw.error === "string" ? raw.error : undefined
  };
}

function readQuota() {
  try {
    return normalizeQuota(JSON.parse(fs.readFileSync(quotaPath, "utf8")));
  } catch {
    return createEmptyQuota();
  }
}

function writeQuota(quota) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(quotaPath, JSON.stringify(normalizeQuota(quota), null, 2));
}

function stripAnsi(text) {
  return text
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b[@-_]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n");
}

function toNormalizedLines(text) {
  return stripAnsi(text)
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function humanizeResetText(text) {
  return text
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-oq-zA-Z])/g, "$1 $2")
    .replace(/\b(\d)\s+(am|pm)\b/gi, "$1$2")
    .replace(/\(\s*/g, "(")
    .replace(/([a-z])\(/g, "$1 (")
    .replace(/\s*\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBucketFromCompactText(compactText, pattern, label) {
  const match = compactText.match(pattern);
  if (!match) {
    return null;
  }

  const usedPercent = Number(match[1]);
  const resetsAt = humanizeResetText(match[2]);

  return {
    label,
    display: `${usedPercent}% used`,
    usedPercent,
    resetsAt
  };
}

function parseClaudeStatusUsage(rawText) {
  const compactText = toNormalizedLines(rawText)
    .join(" ")
    .replace(/[█▌▐▛▜▘▝]+/g, " ")
    .replace(/\s+/g, " ");

  const fiveHour = extractBucketFromCompactText(
    compactText,
    /Cur\w*session\s*(\d{1,3})%\s*used\s*Res(?:ets?|es)\s*([0-9: ]*(?:am|pm)\s*\(Asia\/Shanghai\))/i,
    "Current session"
  );
  const weekly = extractBucketFromCompactText(
    compactText,
    /Current\s*week\s*\(all\s*models\).*?(\d{1,3})%\s*used.*?Resets?\s*([A-Za-z0-9: ]+\(Asia\/Shanghai\))/i,
    "Current week (all models)"
  );

  if (!fiveHour || !weekly) {
    return null;
  }

  return normalizeQuota({
    source: "claude-status",
    fiveHour,
    weekly,
    updatedAt: new Date().toISOString()
  });
}

function resolveClaudeBinary() {
  if (process.env.CLAUDE_BIN) {
    return process.env.CLAUDE_BIN;
  }

  const homeClaude = path.join(process.env.HOME || "", ".local", "bin", "claude");
  if (homeClaude && fs.existsSync(homeClaude)) {
    return homeClaude;
  }

  return "claude";
}

function fetchQuotaFromClaudeStatus(options = {}) {
  const cwd = options.cwd || process.cwd();
  const claudeBinary = resolveClaudeBinary();
  const debugPath = options.debugPath;

  return new Promise((resolve, reject) => {
    const expectScript = `
set timeout 30
log_user 1
spawn ${tclQuote(claudeBinary)}
expect {
  "Quick safety check:" {
    send "\\r"
    exp_continue
  }
  "❯" {
    send "/status\\r"
  }
}
expect {
  "Session ID:" {}
  "Status" {}
}
send "\\033\\[C"
expect {
  "Search settings" {}
  "Auto-compact" {}
  timeout {}
}
send "\\033\\[C"
expect {
  "Current session" {
    after 1500
  }
  timeout {}
}
send "\\033"
expect {
  "Status dialog dismissed" {}
  "❯" {}
  timeout {}
}
send "/exit\\r"
expect eof
`;

    const child = spawn("expect", ["-c", expectScript], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true
    });

    let settled = false;
    let rawText = "";
    let timeoutId;

    const cleanup = () => {
      clearTimeout(timeoutId);

      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Ignore if the process group is already gone.
      }
    };

    const tryResolveFromRawText = () => {
      const quota = parseClaudeStatusUsage(rawText);
      if (!quota) {
        return false;
      }

      settled = true;

      if (debugPath) {
        fs.writeFileSync(debugPath, rawText);
      }

      cleanup();
      resolve(quota);
      return true;
    };

    const onData = (chunk) => {
      if (settled) {
        return;
      }

      rawText += chunk.toString("utf8");
      tryResolveFromRawText();
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    });

    child.on("close", () => {
      if (settled) {
        return;
      }

      if (debugPath) {
        fs.writeFileSync(debugPath, rawText);
      }

      const quota = parseClaudeStatusUsage(rawText);
      if (quota) {
        settled = true;
        cleanup();
        resolve(quota);
        return;
      }

      settled = true;
      cleanup();
      reject(new Error("Unable to parse Claude Code /status usage output"));
    });

    timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      if (!tryResolveFromRawText()) {
        settled = true;

        if (debugPath) {
          fs.writeFileSync(debugPath, rawText);
        }

        cleanup();
        reject(new Error("Timed out while reading Claude Code /status"));
      }
    }, 20000);
  });
}

function tclQuote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

async function updateQuotaCacheFromClaudeStatus(options = {}) {
  const quota = await fetchQuotaFromClaudeStatus(options);
  writeQuota(quota);
  return quota;
}

module.exports = {
  quotaPath,
  normalizeQuota,
  readQuota,
  writeQuota,
  parseClaudeStatusUsage,
  fetchQuotaFromClaudeStatus,
  updateQuotaCacheFromClaudeStatus
};
