const fs = require("node:fs/promises");
const path = require("node:path");

function sanitizeLogValue(value) {
  // Flatten whitespace so each failure stays on a single log line.
  return String(value).replace(/\s+/g, " ").trim();
}

async function writeFailureLog(failures) {
  if (!Array.isArray(failures) || failures.length === 0) {
    return null;
  }

  const logsDir = path.join(process.cwd(), "logs");
  const logFilePath = path.join(logsDir, "failed-movies.log");

  await fs.mkdir(logsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const lines = [`=== ${timestamp} ===`];

  failures.forEach((failure, index) => {
    const title = sanitizeLogValue(failure.title || "Unknown title");
    const imdbId = sanitizeLogValue(failure.imdbId || "n/a");
    const error = sanitizeLogValue(failure.error || "Unknown error");
    lines.push(`${index + 1}. imdb: ${imdbId} | title: ${title} | error: ${error}`);
  });

  lines.push("");
  // Append mode preserves history across runs with timestamp separators.
  await fs.appendFile(logFilePath, `${lines.join("\n")}\n`, "utf8");

  return logFilePath;
}

module.exports = {
  writeFailureLog,
};
