/**
 * logger.js — Structured JSON-file logger for the simulation server.
 *
 * Maintains three log files in logs/:
 *   • activity.json   — every single action (login, post, like, comment, save, follow, …)
 *   • sessions.json   — which users are currently "online"
 *   • stats.json      — rolling counters (updated after every action)
 *
 * All writes are synchronous (appendFileSync / writeFileSync) so nothing is lost on crash.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dir, "..", "logs");

// ── Ensure logs/ directory exists ────────────────────────────────────────────
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── File paths ────────────────────────────────────────────────────────────────
const ACTIVITY_FILE = path.join(LOGS_DIR, "activity.json");
const SESSIONS_FILE = path.join(LOGS_DIR, "sessions.json");
const STATS_FILE = path.join(LOGS_DIR, "stats.json");

// ── Bootstrap files if missing ────────────────────────────────────────────────
const initFile = (filePath, defaultContent) => {
  if (!fs.existsSync(filePath))
    fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), "utf8");
};

initFile(ACTIVITY_FILE, []);
initFile(SESSIONS_FILE, { activeSessions: [], lastUpdated: null });
initFile(STATS_FILE, {
  serverStartedAt: new Date().toISOString(),
  totalActions: 0,
  byType: {
    login: 0, logout: 0, post: 0, like: 0,
    unlike: 0, comment: 0, save: 0, follow: 0,
    unfollow: 0, profile_view: 0, search: 0,
  },
  errors: 0,
  activeUsers: 0,
  registeredNewUsers: 0,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};

// ── Activity log entry ────────────────────────────────────────────────────────
/**
 * Log a single user action.
 * @param {object} entry
 * @param {string} entry.type       - "login"|"post"|"like"|"comment"|"save"|"follow"|…
 * @param {string} entry.actor      - username performing the action
 * @param {string} entry.actorTier  - influencer | active | regular
 * @param {string} [entry.targetUser]  - username of target user (if applicable)
 * @param {string} [entry.targetPost]  - postId (if applicable)
 * @param {string} [entry.detail]   - extra human-readable detail
 * @param {string} [entry.status]   - "success" | "failed"
 * @param {any}    [entry.payload]  - raw response or extra data
 */
export const logAction = (entry) => {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    status: entry.status ?? "success",
    ...entry,
  };

  // Append to activity.json (read → push → write — simple & reliable at small scale)
  const activities = readJson(ACTIVITY_FILE) ?? [];
  activities.push(record);
  // Keep last 5000 entries to avoid unbounded growth
  if (activities.length > 5000) activities.splice(0, activities.length - 5000);
  writeJson(ACTIVITY_FILE, activities);

  // Update stats
  const stats = readJson(STATS_FILE) ?? {};
  stats.totalActions = (stats.totalActions ?? 0) + 1;
  stats.byType = stats.byType ?? {};
  stats.byType[entry.type] = (stats.byType[entry.type] ?? 0) + 1;
  if (entry.status === "failed") stats.errors = (stats.errors ?? 0) + 1;
  stats.lastActionAt = record.timestamp;
  writeJson(STATS_FILE, stats);

  // Console echo
  const icon = {
    login: "🔑", logout: "🔒", post: "📝", like: "❤️", unlike: "💔",
    comment: "💬", save: "🔖", follow: "➕", unfollow: "➖",
    profile_view: "👁️", search: "🔍", register: "👤", error: "❌",
  }[entry.type] ?? "🔄";
  console.log(
    `  ${icon} [${record.timestamp.slice(11, 19)}] @${entry.actor} → ${entry.type}` +
      (entry.targetUser ? ` → @${entry.targetUser}` : "") +
      (entry.detail ? ` (${entry.detail})` : "") +
      (entry.status === "failed" ? " ✗" : ""),
  );

  return record;
};

// ── Session tracking ──────────────────────────────────────────────────────────
export const sessionOnline = (user) => {
  const sessions = readJson(SESSIONS_FILE) ?? { activeSessions: [] };
  // Remove stale entry for same user
  sessions.activeSessions = sessions.activeSessions.filter(
    (s) => s.username !== user.username,
  );
  sessions.activeSessions.push({
    username: user.username,
    name: user.name,
    tier: user.tierLabel,
    onlineSince: new Date().toISOString(),
    userId: user.userId ?? null,
    token: user.token ?? null,
  });
  sessions.lastUpdated = new Date().toISOString();
  writeJson(SESSIONS_FILE, sessions);

  // Update stats.activeUsers
  const stats = readJson(STATS_FILE) ?? {};
  stats.activeUsers = sessions.activeSessions.length;
  writeJson(STATS_FILE, stats);
};

export const sessionOffline = (username) => {
  const sessions = readJson(SESSIONS_FILE) ?? { activeSessions: [] };
  sessions.activeSessions = sessions.activeSessions.filter(
    (s) => s.username !== username,
  );
  sessions.lastUpdated = new Date().toISOString();
  writeJson(SESSIONS_FILE, sessions);

  const stats = readJson(STATS_FILE) ?? {};
  stats.activeUsers = sessions.activeSessions.length;
  writeJson(STATS_FILE, stats);
};

export const clearAllSessions = () => {
  writeJson(SESSIONS_FILE, { activeSessions: [], lastUpdated: new Date().toISOString() });
  const stats = readJson(STATS_FILE) ?? {};
  stats.activeUsers = 0;
  writeJson(STATS_FILE, stats);
};

// ── Read helpers (for REST API) ───────────────────────────────────────────────
export const getActivity = (limit = 100, type = null) => {
  const all = readJson(ACTIVITY_FILE) ?? [];
  const filtered = type ? all.filter((e) => e.type === type) : all;
  return filtered.slice(-limit).reverse(); // newest first
};

export const getSessions = () => readJson(SESSIONS_FILE) ?? { activeSessions: [] };

export const getStats = () => readJson(STATS_FILE) ?? {};

// ── New-user registration count ───────────────────────────────────────────────
export const incrementRegistered = () => {
  const stats = readJson(STATS_FILE) ?? {};
  stats.registeredNewUsers = (stats.registeredNewUsers ?? 0) + 1;
  writeJson(STATS_FILE, stats);
};
