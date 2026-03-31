/**
 * scripts/resetLogs.js
 * ─────────────────────
 * Wipes all log files in logs/ and resets them to their initial empty state.
 * Run with:  node scripts/resetLogs.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dir, "..", "logs");

const defaults = {
  "activity.json": [],
  "sessions.json": { activeSessions: [], lastUpdated: null },
  "stats.json": {
    serverStartedAt: new Date().toISOString(),
    totalActions: 0,
    byType: {
      login: 0, logout: 0, post: 0, like: 0,
      unlike: 0, comment: 0, save: 0, follow: 0,
      unfollow: 0, profile_view: 0, search: 0, register: 0, error: 0,
    },
    errors: 0,
    activeUsers: 0,
    registeredNewUsers: 0,
  },
};

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log("📁 Created logs/ directory");
}

for (const [filename, content] of Object.entries(defaults)) {
  const filePath = path.join(LOGS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
  console.log(`✅ Reset ${filename}`);
}

console.log("\n🗑️  All logs cleared. Ready for a fresh simulation run.\n");
