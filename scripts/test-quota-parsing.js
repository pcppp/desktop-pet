const assert = require("assert");
const {
  normalizeQuota,
  parseStatuslineQuotaCache
} = require("../src/quota-source");
const {
  formatFiveHourResetCountdown,
  formatFiveHourResetText,
  formatWeeklyResetText
} = require("../src/quota-time");

function testFiveHourCountdownFromTimestamp() {
  const resetTimestamp = Date.parse("2026-04-21T13:00:00.000Z");
  const now = new Date("2026-04-21T10:00:00.000Z");
  const countdown = formatFiveHourResetCountdown(resetTimestamp, now);
  assert.deepEqual(countdown, { hours: 3, minutes: 0 });
}

function testFormatsResetTextFromTimestamp() {
  const resetTimestamp = Date.parse("2026-04-21T13:00:00.000Z");
  assert.equal(
    formatFiveHourResetText(resetTimestamp, "Asia/Shanghai"),
    "9:00 PM (Asia/Shanghai)"
  );
  assert.equal(
    formatWeeklyResetText(resetTimestamp, "Asia/Shanghai", "en-US"),
    "Tue, Apr 21, 9:00 PM (Asia/Shanghai)"
  );
}

function testParseStatuslineQuotaCache() {
  const quota = parseStatuslineQuotaCache({
    updatedAt: "2026-04-21T10:00:00.000Z",
    rate_limits: {
      five_hour: {
        used_percentage: 65.1,
        resets_at: 1776776400
      },
      seven_day: {
        used_percentage: 27.4,
        resets_at: 1777204800
      }
    }
  }, {
    timeZone: "Asia/Shanghai",
    locale: "en-US"
  });

  assert(quota);
  assert.equal(quota.source, "claude-debug-cache");
  assert.equal(quota.fiveHour.usedPercent, 65);
  assert.equal(quota.weekly.usedPercent, 27);
  assert.equal(quota.fiveHour.resetTimestamp, 1776776400000);
  assert.equal(quota.weekly.resetTimestamp, 1777204800000);
  assert.equal(quota.fiveHour.resetsAt, "9:00 PM (Asia/Shanghai)");
  assert.equal(quota.fiveHour.menuTitle, "5小时 limit 65%");
  assert.equal(quota.fiveHour.menuSubtitle, "Resets at Apr 21, 9:00 PM");
  assert.equal(quota.weekly.menuTitle, "Weekly Limits 27%");
}

function testNormalizeQuotaPreservesTimestampBuckets() {
  const quota = normalizeQuota({
    source: "claude-debug-cache",
    fiveHour: {
      label: "Current session",
      display: "65% used",
      usedPercent: 65,
      resetTimestamp: 1776776400000,
      resetsAt: "9:00 PM (Asia/Shanghai)",
      menuTitle: "5小时 limit 65%",
      menuSubtitle: "Resets at Apr 21, 9:00 PM"
    },
    weekly: {
      label: "Current week (all models)",
      display: "27% used",
      usedPercent: 27,
      resetTimestamp: 1777204800000,
      resetsAt: "Sat, Apr 25, 8:00 PM (Asia/Shanghai)",
      menuTitle: "Weekly Limits 27%",
      menuSubtitle: "Resets Apr 25, 8:00 PM"
    },
    updatedAt: "2026-04-21T10:00:00.000Z"
  });

  assert.equal(quota.fiveHour.resetTimestamp, 1776776400000);
  assert.equal(quota.weekly.resetTimestamp, 1777204800000);
  assert.equal(quota.fiveHour.menuSubtitle, "Resets at Apr 21, 9:00 PM");
}

function testMissingCacheReturnsNull() {
  const quota = parseStatuslineQuotaCache({
    updatedAt: "2026-04-21T10:00:00.000Z",
    rate_limits: {}
  }, {
    timeZone: "Asia/Shanghai"
  });

  assert.equal(quota, null);
}

function main() {
  testFiveHourCountdownFromTimestamp();
  testFormatsResetTextFromTimestamp();
  testParseStatuslineQuotaCache();
  testNormalizeQuotaPreservesTimestampBuckets();
  testMissingCacheReturnsNull();
  console.log("quota parsing tests passed");
}

main();
