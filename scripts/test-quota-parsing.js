const assert = require("assert");
const { parseClaudeStatusUsage } = require("../src/quota-source");
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

function main() {
  testCurrentSessionResetValidation();
  testFiveHourCountdown();
  testFiveHourCountdownInShanghaiTimeZone();
  testCollapsedStatusParsing();
  testRejectsBadFiveHourReset();
  console.log("quota parsing tests passed");
}

main();
