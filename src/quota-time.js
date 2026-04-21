function normalizeResetText(text) {
  return String(text || "")
    .replace(/^reset(?:s)?(?:\s+in)?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isCurrentSessionResetText(resetsAt) {
  const normalized = normalizeResetText(resetsAt);
  return /^(\d{1,2})(?::\d{2})?\s*(am|pm)(?:\s*\([^)]+\))?$/i.test(normalized);
}

function isValidDate(value) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function toDateFromTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const milliseconds = timestamp > 1e12
    ? timestamp
    : timestamp * 1000;
  const parsed = new Date(milliseconds);
  return isValidDate(parsed) ? parsed : null;
}

function formatFiveHourResetCountdown(resetTimestamp, now = new Date()) {
  const target = toDateFromTimestamp(resetTimestamp);
  if (!target || !isValidDate(now)) {
    return null;
  }

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      hours: 0,
      minutes: 0
    };
  }

  const totalMinutes = Math.ceil(diffMs / 60000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60
  };
}

function formatTimeInTimeZone(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function formatWeekdayDateTime(date, timeZone, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function formatFiveHourResetText(resetTimestamp, timeZone) {
  const target = toDateFromTimestamp(resetTimestamp);
  if (!target) {
    return "Unknown";
  }

  return `${formatTimeInTimeZone(target, timeZone)} (${timeZone})`;
}

function formatWeeklyResetText(resetTimestamp, timeZone, locale = "en-US") {
  const target = toDateFromTimestamp(resetTimestamp);
  if (!target) {
    return "Unknown";
  }

  return `${formatWeekdayDateTime(target, timeZone, locale)} (${timeZone})`;
}

function formatResetForMenu(resetTimestamp, timeZone, locale = "en-US") {
  const target = toDateFromTimestamp(resetTimestamp);
  if (!target) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(target);
}

module.exports = {
  formatFiveHourResetCountdown,
  formatFiveHourResetText,
  formatResetForMenu,
  formatWeeklyResetText,
  isCurrentSessionResetText,
  normalizeResetText,
  toDateFromTimestamp
};
