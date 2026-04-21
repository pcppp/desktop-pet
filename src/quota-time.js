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

function parseFiveHourResetTime(resetsAt, fallbackTimeZone, now = new Date()) {
  if (!isCurrentSessionResetText(resetsAt)) {
    return null;
  }

  const normalized = normalizeResetText(resetsAt);
  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!timeMatch) {
    return null;
  }

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2] || "0");
  const period = timeMatch[3].toLowerCase();

  if (period === "pm" && hour !== 12) {
    hour += 12;
  } else if (period === "am" && hour === 12) {
    hour = 0;
  }

  const effectiveTimeZone = detectResetTimeZone(resetsAt) || fallbackTimeZone || "UTC";
  const zonedNow = getTimeZoneDateParts(now, effectiveTimeZone);

  let targetYear = zonedNow.year;
  let targetMonth = zonedNow.month;
  let targetDay = zonedNow.day;

  if (hour < zonedNow.hour || (hour === zonedNow.hour && minute <= zonedNow.minute)) {
    const nextDay = getNextCalendarDayParts(targetYear, targetMonth, targetDay);
    targetYear = nextDay.year;
    targetMonth = nextDay.month;
    targetDay = nextDay.day;
  }

  return zonedDateTimeToUtcDate(effectiveTimeZone, targetYear, targetMonth, targetDay, hour, minute);
}

function formatFiveHourResetCountdown(resetsAt, fallbackTimeZone, now = new Date()) {
  const target = parseFiveHourResetTime(resetsAt, fallbackTimeZone, now);
  if (!target) {
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

module.exports = {
  detectResetTimeZone,
  formatFiveHourResetCountdown,
  getNextCalendarDayParts,
  getTimeZoneDateParts,
  isCurrentSessionResetText,
  normalizeResetText,
  parseFiveHourResetTime,
  zonedDateTimeToUtcDate
};
