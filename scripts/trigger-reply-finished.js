const fs = require("fs");
const path = require("path");

const eventPath = path.join(__dirname, "..", "data", "events.ndjson");

fs.mkdirSync(path.dirname(eventPath), { recursive: true });
fs.appendFileSync(
  eventPath,
  `${JSON.stringify({ type: "reply-finished", at: new Date().toISOString() })}\n`
);

console.log("reply-finished event written");
