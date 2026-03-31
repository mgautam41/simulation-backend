/**
 * simulationEngine.js — Core simulation loop.
 *
 * Each virtual user:
 *   1. Logs in (session cached in-memory; re-login on expiry)
 *   2. Picks a weighted-random action (like, comment, save, post, follow, view, search)
 *   3. Calls the real SnapLink API
 *   4. Logs the result to logs/activity.json
 *   5. Sleeps a random interval then repeats
 */

import { api, apiMultipart, BASE_URL } from "./apiClient.js";
import {
  logAction,
  sessionOnline,
  sessionOffline,
  clearAllSessions,
  incrementRegistered,
} from "./logger.js";
import {
  sleep,
  randInt,
  pick,
  pickN,
  chance,
  extractUserId,
  picsumUrl,
} from "./helpers.js";
import { ALL_USERS, NEW_USERS } from "../data/users.js";
import { CAPTIONS, COMMENTS, LOCATIONS } from "../data/content.js";

// ── Engine state ──────────────────────────────────────────────────────────────
let isRunning = false;
let isPaused = false;
let engineStartedAt = null;

/** Live session store:  username → { token, userId, user } */
const sessions = new Map();

/**
 * Growing post cache so users can react to each other's posts.
 * Seeded from tracker posts at startup if desired; new posts are appended.
 */
const postCache = [];

// ── Engine config (updateable at runtime via REST) ────────────────────────────
export const CONFIG = {
  /** Minimum delay between user actions (ms) */
  actionDelayMin: 3000,
  /** Maximum delay between user actions (ms) */
  actionDelayMax: 14000,
  /** How many user loops run concurrently */
  maxConcurrentUsers: 15,
  /**
   * Relative weights for each action type.
   * Higher number = more frequent. These do NOT need to sum to any value.
   */
  actionWeights: {
    like: 35,
    comment: 20,
    save: 10,
    post: 8,
    follow: 12,
    profile_view: 10,
    search: 5,
  },
};

// ── Weighted random selection ─────────────────────────────────────────────────
const weightedRandom = (weights) => {
  const keys = Object.keys(weights);
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  let r = Math.random() * total;
  for (const key of keys) {
    r -= weights[key];
    if (r < 0) return key;
  }
  return keys[keys.length - 1];
};

// ── Session management ────────────────────────────────────────────────────────
const ensureLoggedIn = async (user) => {
  if (sessions.has(user.username)) return sessions.get(user.username);

  const { ok, data } = await api("POST", "/api/users/signin", {
    identifier: user.email,
    password: user.password,
  });

  if (ok && data.token) {
    const userId = extractUserId(data, data.token);
    const session = { token: data.token, userId, user };
    sessions.set(user.username, session);
    sessionOnline({ ...user, userId, token: data.token });
    logAction({
      type: "login",
      actor: user.username,
      actorTier: user.tierLabel,
      detail: "userId=" + userId,
    });
    return session;
  }

  // New users may not be registered yet — try registration first
  if (NEW_USERS.some((u) => u.username === user.username)) {
    await tryRegister(user);
    return null; // Will retry login on next cycle
  }

  logAction({
    type: "login",
    actor: user.username,
    actorTier: user.tierLabel,
    status: "failed",
    detail: data?.message ?? "unknown error",
  });
  return null;
};

const tryRegister = async (user) => {
  const { ok, data } = await api("POST", "/api/users/signup", {
    name: user.name,
    username: user.username,
    email: user.email,
    password: user.password,
    gender: user.gender,
    phone: user.phone,
    bio: user.bio,
  });
  const alreadyExists =
    data?.message?.toLowerCase().includes("already") ||
    data?.message?.toLowerCase().includes("exist");
  const success = (ok && data.success) || alreadyExists;
  logAction({
    type: "register",
    actor: user.username,
    actorTier: user.tierLabel,
    status: success ? "success" : "failed",
    detail: data?.message ?? "registered",
  });
  if (ok && data.success) incrementRegistered();
};

// ── Action helpers ────────────────────────────────────────────────────────────
const getOtherPost = (selfUsername) => {
  const candidates = postCache.filter((p) => p.postedBy !== selfUsername);
  if (candidates.length) return pick(candidates);
  return postCache.length ? pick(postCache) : null;
};

// ── Individual actions ────────────────────────────────────────────────────────
const doLike = async (s) => {
  const post = getOtherPost(s.user.username);
  if (!post) return;
  const { ok } = await api("POST", `/api/posts/${post.postId}/like`, null, s.token);
  logAction({
    type: "like",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    targetUser: post.postedBy,
    targetPost: post.postId,
    status: ok ? "success" : "failed",
    detail: (post.caption ?? "").slice(0, 50),
  });
};

const doComment = async (s) => {
  const post = getOtherPost(s.user.username);
  if (!post) return;
  const text = pick(COMMENTS);
  const { ok } = await api("POST", `/api/posts/${post.postId}/comment`, { text }, s.token);
  logAction({
    type: "comment",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    targetUser: post.postedBy,
    targetPost: post.postId,
    status: ok ? "success" : "failed",
    detail: text,
  });
};

const doSave = async (s) => {
  const post = getOtherPost(s.user.username);
  if (!post) return;
  const { ok } = await api("PUT", `/api/posts/${post.postId}/save`, null, s.token);
  logAction({
    type: "save",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    targetUser: post.postedBy,
    targetPost: post.postId,
    status: ok ? "success" : "failed",
  });
};

const doPost = async (s) => {
  const imageCount = randInt(1, 3);
  const seed = `${s.user.username}_${Date.now()}`;
  const imageUrls = Array.from({ length: imageCount }, (_, i) =>
    picsumUrl(`${seed}_${i}`, 800, 800),
  );
  const caption = pick(CAPTIONS);
  const location = chance(0.75) ? pick(LOCATIONS) : "";
  const { ok, data } = await apiMultipart(
    "/api/posts/create",
    { caption, location },
    imageUrls,
    s.token,
  );
  if (ok && data.post?._id) {
    postCache.push({
      postId: data.post._id,
      postedBy: s.user.username,
      postedByUserId: s.userId,
      caption,
    });
    // Cap cache size
    if (postCache.length > 500) postCache.splice(0, postCache.length - 500);
    logAction({
      type: "post",
      actor: s.user.username,
      actorTier: s.user.tierLabel,
      targetPost: data.post._id,
      detail: `"${caption.slice(0, 45)}" — ${imageCount} image(s) • ${location || "no location"}`,
    });
  } else {
    logAction({
      type: "post",
      actor: s.user.username,
      actorTier: s.user.tierLabel,
      status: "failed",
      detail: data?.message ?? "upload failed",
    });
  }
};

const doFollow = async (s) => {
  const target = pick(ALL_USERS.filter((u) => u.username !== s.user.username));
  if (!target) return;
  const { ok } = await api("POST", `/api/users/follow/${target.username}`, null, s.token);
  logAction({
    type: "follow",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    targetUser: target.username,
    status: ok ? "success" : "failed",
  });
};

const doProfileView = async (s) => {
  const target = pick(ALL_USERS.filter((u) => u.username !== s.user.username));
  if (!target) return;
  const { ok } = await api("GET", `/api/users/${target.username}`, null, s.token);
  logAction({
    type: "profile_view",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    targetUser: target.username,
    status: ok ? "success" : "failed",
  });
};

const doSearch = async (s) => {
  const q = pick(["amit", "patel", "photo", "india", "riya", "dev", "chai", "vibes", "neha", "hetal"]);
  await api("GET", `/api/users/search?q=${q}`, null, s.token);
  logAction({
    type: "search",
    actor: s.user.username,
    actorTier: s.user.tierLabel,
    detail: `query="${q}"`,
  });
};

// ── Action dispatcher ─────────────────────────────────────────────────────────
const performAction = async (session) => {
  const actionType = weightedRandom(CONFIG.actionWeights);
  try {
    switch (actionType) {
      case "like":         await doLike(session); break;
      case "comment":      await doComment(session); break;
      case "save":         await doSave(session); break;
      case "post":         await doPost(session); break;
      case "follow":       await doFollow(session); break;
      case "profile_view": await doProfileView(session); break;
      case "search":       await doSearch(session); break;
    }
  } catch (err) {
    logAction({
      type: "error",
      actor: session.user.username,
      actorTier: session.user.tierLabel,
      status: "failed",
      detail: err.message,
    });
  }
};

// ── Single-user async loop ────────────────────────────────────────────────────
const runUserLoop = async (user) => {
  while (isRunning) {
    // Pause support — poll every second while paused
    while (isPaused && isRunning) await sleep(1000);
    if (!isRunning) break;

    const session = await ensureLoggedIn(user);
    if (session) await performAction(session);

    // Human-like random wait between actions
    const delay = randInt(CONFIG.actionDelayMin, CONFIG.actionDelayMax);
    await sleep(delay);
  }

  // Cleanup when engine stops
  sessions.delete(user.username);
  sessionOffline(user.username);
  logAction({ type: "logout", actor: user.username, actorTier: user.tierLabel });
};

// ── Public engine controls ────────────────────────────────────────────────────
export const startSimulation = async () => {
  if (isRunning) return { status: "already_running", detail: "Engine is already active." };
  isRunning = true;
  isPaused = false;
  engineStartedAt = Date.now();
  clearAllSessions();

  const usersToRun = pickN(ALL_USERS, CONFIG.maxConcurrentUsers);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🚀 SnapLink Simulation Engine STARTED`);
  console.log(`   Target API : ${BASE_URL}`);
  console.log(`   Total users: ${ALL_USERS.length} (running ${usersToRun.length} concurrently)`);
  console.log(`   Port       : 1912`);
  console.log(`${"═".repeat(60)}\n`);

  // Stagger user loop starts to avoid thundering-herd at t=0
  usersToRun.forEach((user, idx) => {
    setTimeout(() => {
      if (isRunning) runUserLoop(user);
    }, idx * 700);
  });

  return { status: "started", concurrentUsers: usersToRun.length, totalUsers: ALL_USERS.length };
};

export const stopSimulation = () => {
  if (!isRunning) return { status: "not_running" };
  isRunning = false;
  isPaused = false;
  console.log("\n⏹️  Simulation STOPPED\n");
  return { status: "stopped" };
};

export const pauseSimulation = () => {
  if (!isRunning) return { status: "not_running" };
  isPaused = true;
  console.log("\n⏸️  Simulation PAUSED\n");
  return { status: "paused" };
};

export const resumeSimulation = () => {
  if (!isRunning) return { status: "not_running" };
  isPaused = false;
  console.log("\n▶️  Simulation RESUMED\n");
  return { status: "resumed" };
};

export const getEngineStatus = () => ({
  isRunning,
  isPaused,
  startedAt: engineStartedAt ? new Date(engineStartedAt).toISOString() : null,
  uptimeMs: engineStartedAt ? Date.now() - engineStartedAt : 0,
  uptimeFormatted: engineStartedAt
    ? (() => {
        const ms = Date.now() - engineStartedAt;
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${m}m ${s}s`;
      })()
    : null,
  activeSessionsInMemory: sessions.size,
  postCacheSize: postCache.length,
  totalUsers: ALL_USERS.length,
  config: CONFIG,
  apiTarget: BASE_URL,
});

export const updateConfig = (patch) => {
  if (patch.actionDelayMin !== undefined) CONFIG.actionDelayMin = patch.actionDelayMin;
  if (patch.actionDelayMax !== undefined) CONFIG.actionDelayMax = patch.actionDelayMax;
  if (patch.maxConcurrentUsers !== undefined) CONFIG.maxConcurrentUsers = patch.maxConcurrentUsers;
  if (patch.actionWeights) Object.assign(CONFIG.actionWeights, patch.actionWeights);
  return CONFIG;
};

/** Expose postCache for seeding from outside (e.g. from known post IDs in tracker) */
export const seedPostCache = (posts) => {
  for (const p of posts) {
    if (!postCache.find((x) => x.postId === p.postId)) {
      postCache.push(p);
    }
  }
};
