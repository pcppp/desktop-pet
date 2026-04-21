const os = require("os");
const path = require("path");

const claudeDebugDir = path.join(os.homedir(), ".claude", "debug");
const claudeStatuslineQuotaCachePath = process.env.CLAUDE_DESKTOP_PET_RATE_LIMITS_PATH
  || path.join(claudeDebugDir, "desktop-pet-rate-limits.json");

module.exports = {
  claudeDebugDir,
  claudeStatuslineQuotaCachePath
};
