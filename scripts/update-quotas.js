const fs = require("fs");
const path = require("path");

const quotaPath = path.join(__dirname, "..", "data", "quota.json");
const eventPath = path.join(__dirname, "..", "data", "events.ndjson");

const demoQuota = {
  source: "demo-cache",
  weekly: {
    display: "16% used",
    usedPercent: 16,
    resetTimestamp: Date.now() + (6 * 24 * 60 * 60 * 1000),
    resetsAt: "Apr 27 at 2pm (Asia/Shanghai)"
  },
  fiveHour: {
    display: "25% used",
    usedPercent: 25,
    resetTimestamp: Date.now() + (3 * 60 * 60 * 1000),
    resetsAt: "4pm (Asia/Shanghai)"
  },
  updatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(quotaPath), { recursive: true });
fs.writeFileSync(quotaPath, JSON.stringify(demoQuota, null, 2));
fs.appendFileSync(
  eventPath,
  `${JSON.stringify({ type: "quota-updated", at: new Date().toISOString() })}\n`
);

console.log("quota.json updated with demo fallback values");
