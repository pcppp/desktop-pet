const assert = require("assert");
const { normalizeQuota, parseClaudeStatusUsage } = require("../src/quota-source");
const { formatFiveHourResetCountdown, isCurrentSessionResetText } = require("../src/quota-time");

function testCurrentSessionResetValidation() {
  assert.equal(isCurrentSessionResetText("9pm (Asia/Shanghai)"), true);
  assert.equal(isCurrentSessionResetText("10:30am (Asia/Shanghai)"), true);
  assert.equal(isCurrentSessionResetText("Apr 27 at 2pm (Asia/Shanghai)"), false);
  assert.equal(isCurrentSessionResetText("Resets Apr 27 at 2pm (Asia/Shanghai)"), false);
}

function testFiveHourCountdown() {
  const now = new Date("2026-04-21T08:00:00.000Z");
  const countdown = formatFiveHourResetCountdown("9pm (Asia/Shanghai)", "UTC", now);
  assert.deepEqual(countdown, { hours: 5, minutes: 0 });
}

function testFiveHourCountdownInShanghaiTimeZone() {
  const now = new Date("2026-04-21T08:00:00.000Z");
  const countdown = formatFiveHourResetCountdown("9pm (Asia/Shanghai)", "Asia/Shanghai", now);
  assert.deepEqual(countdown, { hours: 5, minutes: 0 });
}

function testCollapsedStatusParsing() {
  const rawText = "Current session █████████ 59% used Resets 9pm (Asia/Shanghai) Current week (all models) █████ 26% used Resets Apr 27 at 2pm (Asia/Shanghai) What's contributing to your limits usage?";
  const quota = parseClaudeStatusUsage(rawText);
  assert(quota);
  assert.equal(quota.fiveHour.resetsAt, "9pm (Asia/Shanghai)");
  assert.equal(quota.fiveHour.menuSubtitle, "Resets at 9:00 PM");
  assert.equal(quota.weekly.resetsAt, "Apr 27 at 2pm (Asia/Shanghai)");
}

function testRejectsBadFiveHourReset() {
  const rawText = "Current session 59% used Resets Apr 27 at 2pm (Asia/Shanghai) Current week (all models) 26% used Resets Apr 27 at 2pm (Asia/Shanghai)";
  const quota = parseClaudeStatusUsage(rawText);
  assert.equal(quota, null);
}

function testSanitizesCorruptedFiveHourCache() {
  const quota = normalizeQuota({
    source: "claude-status",
    fiveHour: {
      label: "Current session",
      display: "60% used",
      usedPercent: 60,
      resetsAt: "Apr 27 at 2pm (Asia/Shanghai)",
      menuTitle: "5小时 limit 60%",
      menuSubtitle: "Resets in Apr 27 2:00 PM"
    },
    weekly: {
      label: "Current week (all models)",
      display: "27% used",
      usedPercent: 27,
      resetsAt: "Apr 27 at 2pm (Asia/Shanghai)",
      menuTitle: "Weekly Limits 27%",
      menuSubtitle: "Resets Apr 27 2:00 PM"
    },
    updatedAt: "2026-04-21T10:37:05.789Z"
  });

  assert.equal(quota.fiveHour.display, "60% used");
  assert.equal(quota.fiveHour.usedPercent, 60);
  assert.equal(quota.fiveHour.resetsAt, "Unknown");
  assert.equal(quota.fiveHour.menuSubtitle, "Resets in Unknown");
}

function testKeepsPreviousValidFiveHourReset() {
  const quota = normalizeQuota({
    source: "claude-status",
    previousQuota: {
      source: "claude-status",
      fiveHour: {
        label: "Current session",
        display: "59% used",
        usedPercent: 59,
        resetsAt: "9pm (Asia/Shanghai)",
        menuTitle: "5小时 limit 59%",
        menuSubtitle: "Resets at 9:00 PM",
        lastKnownValidResetsAt: "9pm (Asia/Shanghai)"
      },
      weekly: {
        label: "Current week (all models)",
        display: "27% used",
        usedPercent: 27,
        resetsAt: "Apr 27 at 2pm (Asia/Shanghai)",
        menuTitle: "Weekly Limits 27%",
        menuSubtitle: "Resets Apr 27 2:00 PM"
      },
      updatedAt: "2026-04-21T10:28:54.446Z"
    },
    fiveHour: {
      label: "Current session",
      display: "60% used",
      usedPercent: 60,
      resetsAt: "Unknown",
      menuTitle: "5小时 limit 60%",
      menuSubtitle: "Resets in Unknown"
    },
    weekly: {
      label: "Current week (all models)",
      display: "27% used",
      usedPercent: 27,
      resetsAt: "Apr 27 at 2pm (Asia/Shanghai)",
      menuTitle: "Weekly Limits 27%",
      menuSubtitle: "Resets Apr 27 2:00 PM"
    },
    updatedAt: "2026-04-21T10:37:05.789Z"
  });

  assert.equal(quota.fiveHour.display, "60% used");
  assert.equal(quota.fiveHour.usedPercent, 60);
  assert.equal(quota.fiveHour.resetsAt, "9pm (Asia/Shanghai)");
  assert.equal(quota.fiveHour.menuSubtitle, "Resets at 9:00 PM");
  assert.equal(quota.fiveHour.lastKnownValidResetsAt, "9pm (Asia/Shanghai)");
}

function main() {
  testCurrentSessionResetValidation();
  testFiveHourCountdown();
  testFiveHourCountdownInShanghaiTimeZone();
  testCollapsedStatusParsing();
  testRejectsBadFiveHourReset();
  testSanitizesCorruptedFiveHourCache();
  testKeepsPreviousValidFiveHourReset();
  console.log("quota parsing tests passed");
}

main();
