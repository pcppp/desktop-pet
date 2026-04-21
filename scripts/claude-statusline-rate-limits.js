#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { claudeDebugDir, claudeStatuslineQuotaCachePath } = require("../src/quota-paths");

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function normalizePayload(payload) {
  return {
    updatedAt: new Date().toISOString(),
    sessionId: payload && payload.session_id ? payload.session_id : null,
    transcriptPath: payload && payload.transcript_path ? payload.transcript_path : null,
    cwd: payload && payload.cwd ? payload.cwd : null,
    version: payload && payload.version ? payload.version : null,
    rate_limits: payload && payload.rate_limits && typeof payload.rate_limits === "object"
      ? payload.rate_limits
      : {}
  };
}

function formatStatusLine(cache) {
  const fiveHour = cache.rate_limits && cache.rate_limits.five_hour;
  const sevenDay = cache.rate_limits && cache.rate_limits.seven_day;
  const parts = [];

  if (fiveHour && Number.isFinite(fiveHour.used_percentage)) {
    parts.push(`5h ${Math.round(fiveHour.used_percentage)}%`);
  }

  if (sevenDay && Number.isFinite(sevenDay.used_percentage)) {
    parts.push(`7d ${Math.round(sevenDay.used_percentage)}%`);
  }

  return parts.length > 0 ? parts.join(" | ") : "rate limits pending";
}

async function main() {
  const rawInput = await readStdin();
  const payload = rawInput.trim() ? JSON.parse(rawInput) : {};
  const cache = normalizePayload(payload);
  const cacheDir = path.dirname(claudeStatuslineQuotaCachePath);
  const tempPath = path.join(cacheDir, `desktop-pet-rate-limits.${process.pid}.tmp`);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(claudeDebugDir, { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(cache, null, 2));
  fs.renameSync(tempPath, claudeStatuslineQuotaCachePath);

  process.stdout.write(`${formatStatusLine(cache)}\n`);
}

main().catch(() => {
  process.stdout.write("rate limits unavailable\n");
  process.exit(0);
});
