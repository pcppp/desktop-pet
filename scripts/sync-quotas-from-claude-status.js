const path = require("path");
const {
  updateQuotaCacheFromClaudeStatus
} = require("../src/quota-source");

async function main() {
  const quota = await updateQuotaCacheFromClaudeStatus({
    cwd: path.join(__dirname, "..")
  });

  console.log(JSON.stringify(quota, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
