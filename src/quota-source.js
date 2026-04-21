const fs = require("fs");
const path = require("path");
const {
  formatFiveHourResetText,
  formatResetForMenu,
  formatWeeklyResetText,
  toDateFromTimestamp
} = require("./quota-time");
const { claudeStatuslineQuotaCachePath } = require("./quota-paths");

const dataDir = path.join(__dirname, "..", "data");
const quotaPath = path.join(dataDir, "quota.json");

function createEmptyBucket(options) {
  return {
    label: options.label,
    display: "Unavailable",
    usedPercent: null,
    resetTimestamp: null,
    resetsAt: "Unknown",
    menuTitle: options.emptyTitle,
    menuSubtitle: options.emptySubtitle
  };
}

function createEmptyQuota() {
  return {
    source: "unavailable",
    weekly: createEmptyBucket({
      label: "Current week (all models)",
      emptyTitle: "Weekly Limits --",
      emptySubtitle: "Resets Unknown"
    }),
    fiveHour: createEmptyBucket({
      label: "Current session",
      emptyTitle: "5小时 limit --",
      emptySubtitle: "Resets in Unknown"
    }),
    updatedAt: "unknown"
  };
}

function normalizePercent(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeTimestamp(value) {
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeTimestamp(numeric);
    }
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const normalized = value > 1e12
    ? Math.round(value)
    : Math.round(value * 1000);
  return toDateFromTimestamp(normalized) ? normalized : null;
}

function buildBucketFromRateLimit(options) {
  const usedPercent = normalizePercent(options.usedPercentage);
  const resetTimestamp = normalizeTimestamp(options.resetTimestamp);
  const display = usedPercent == null ? "Unavailable" : `${usedPercent}% used`;

  let resetsAt = "Unknown";
  let menuSubtitle = options.emptySubtitle;

  if (resetTimestamp) {
    resetsAt = options.kind === "fiveHour"
      ? formatFiveHourResetText(resetTimestamp, options.timeZone)
      : formatWeeklyResetText(resetTimestamp, options.timeZone, options.locale);

    const formattedForMenu = formatResetForMenu(resetTimestamp, options.timeZone, options.locale);
    menuSubtitle = options.kind === "fiveHour"
      ? `Resets at ${formattedForMenu}`
      : `Resets ${formattedForMenu}`;
  }

  return {
    label: options.label,
    display,
    usedPercent,
    resetTimestamp,
    resetsAt,
    menuTitle: usedPercent == null
      ? options.emptyTitle
      : `${options.titlePrefix} ${usedPercent}%`,
    menuSubtitle
  };
}

function normalizeBucket(bucket, options) {
  if (!bucket || typeof bucket !== "object") {
    return createEmptyBucket(options);
  }

  const usedPercent = normalizePercent(bucket.usedPercent);
  const resetTimestamp = normalizeTimestamp(bucket.resetTimestamp);
  const display = typeof bucket.display === "string" && bucket.display.trim()
    ? bucket.display
    : (usedPercent == null ? "Unavailable" : `${usedPercent}% used`);
  const resetsAt = typeof bucket.resetsAt === "string" && bucket.resetsAt.trim()
    ? bucket.resetsAt
    : "Unknown";
  const menuTitle = typeof bucket.menuTitle === "string" && bucket.menuTitle.trim()
    ? bucket.menuTitle
    : (usedPercent == null ? options.emptyTitle : `${options.titlePrefix} ${usedPercent}%`);
  const menuSubtitle = typeof bucket.menuSubtitle === "string" && bucket.menuSubtitle.trim()
    ? bucket.menuSubtitle
    : options.emptySubtitle;

  return {
    label: typeof bucket.label === "string" && bucket.label.trim()
      ? bucket.label
      : options.label,
    display,
    usedPercent,
    resetTimestamp,
    resetsAt,
    menuTitle,
    menuSubtitle
  };
}

function normalizeQuota(raw) {
  const empty = createEmptyQuota();

  if (!raw || typeof raw !== "object") {
    return empty;
  }

  return {
    source: typeof raw.source === "string" && raw.source.trim()
      ? raw.source
      : empty.source,
    weekly: normalizeBucket(raw.weekly, {
      label: empty.weekly.label,
      titlePrefix: "Weekly Limits",
      emptyTitle: empty.weekly.menuTitle,
      emptySubtitle: empty.weekly.menuSubtitle
    }),
    fiveHour: normalizeBucket(raw.fiveHour, {
      label: empty.fiveHour.label,
      titlePrefix: "5小时 limit",
      emptyTitle: empty.fiveHour.menuTitle,
      emptySubtitle: empty.fiveHour.menuSubtitle
    }),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt
      : empty.updatedAt,
    error: typeof raw.error === "string" && raw.error.trim()
      ? raw.error
      : undefined
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

function readStatuslineQuotaCache(cachePath = claudeStatuslineQuotaCachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
}

function extractRateLimitBucket(rateLimits, key) {
  if (!rateLimits || typeof rateLimits !== "object") {
    return null;
  }

  const bucket = rateLimits[key];
  return bucket && typeof bucket === "object" ? bucket : null;
}

function parseStatuslineQuotaCache(raw, options = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const timeZone = options.timeZone || raw.timeZone || "UTC";
  const locale = options.locale || raw.locale || "en-US";
  const rateLimits = raw.rate_limits && typeof raw.rate_limits === "object"
    ? raw.rate_limits
    : raw.rateLimits;

  const fiveHourRateLimit = extractRateLimitBucket(rateLimits, "five_hour");
  const weeklyRateLimit = extractRateLimitBucket(rateLimits, "seven_day");

  if (!fiveHourRateLimit && !weeklyRateLimit) {
    return null;
  }

  return normalizeQuota({
    source: "claude-debug-cache",
    fiveHour: buildBucketFromRateLimit({
      kind: "fiveHour",
      label: "Current session",
      titlePrefix: "5小时 limit",
      emptyTitle: "5小时 limit --",
      emptySubtitle: "Resets in Unknown",
      usedPercentage: fiveHourRateLimit && fiveHourRateLimit.used_percentage,
      resetTimestamp: fiveHourRateLimit && fiveHourRateLimit.resets_at,
      timeZone,
      locale
    }),
    weekly: buildBucketFromRateLimit({
      kind: "weekly",
      label: "Current week (all models)",
      titlePrefix: "Weekly Limits",
      emptyTitle: "Weekly Limits --",
      emptySubtitle: "Resets Unknown",
      usedPercentage: weeklyRateLimit && weeklyRateLimit.used_percentage,
      resetTimestamp: weeklyRateLimit && weeklyRateLimit.resets_at,
      timeZone,
      locale
    }),
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt
      : new Date().toISOString()
  });
}

async function updateQuotaCacheFromClaudeStatus(options = {}) {
  const rawCache = readStatuslineQuotaCache(options.cachePath);
  const parsedQuota = parseStatuslineQuotaCache(rawCache, {
    timeZone: options.timeZone,
    locale: options.locale
  });

  if (!parsedQuota) {
    throw new Error("Claude rate limit debug cache is unavailable");
  }

  writeQuota(parsedQuota);
  return parsedQuota;
}

module.exports = {
  claudeStatuslineQuotaCachePath,
  createEmptyQuota,
  normalizeQuota,
  parseStatuslineQuotaCache,
  quotaPath,
  readQuota,
  readStatuslineQuotaCache,
  updateQuotaCacheFromClaudeStatus,
  writeQuota
};
