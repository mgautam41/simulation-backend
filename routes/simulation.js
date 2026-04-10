/**
 * routes/simulation.js — REST API routes for the simulation server.
 *
 * All routes are mounted at /api/sim in server.js.
 *
 * POST /api/sim/start           — Start the simulation engine
 * POST /api/sim/stop            — Stop the simulation engine
 * POST /api/sim/pause           — Pause all user loops
 * POST /api/sim/resume          — Resume paused loops
 * GET  /api/sim/status          — Engine status + config
 * GET  /api/sim/logs            — Latest activity log (query: limit, type)
 * GET  /api/sim/sessions        — Currently online virtual users
 * GET  /api/sim/stats           — Rolling counters
 * GET  /api/sim/users           — Full user roster
 * PATCH /api/sim/config         — Update engine config at runtime
 */

import { Router } from "express";
import {
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  getEngineStatus,
} from "../lib/simulationEngine.js";
import { getActivity, getSessions, getStats } from "../lib/logger.js";
import { ALL_USERS, EXISTING_USERS, NEW_USERS } from "../data/users.js";
import { updateConfig } from "../lib/simulationEngine.js";
import fs from "fs";
import path from "path";

import fetch from "node-fetch";
import FormData from "form-data";

const router = Router();

// ── Auto-follow toggle state and logic
let autoFollowInterval = null;
let autoFollowActive = false;

// Helper: get celebrity/most-followed users (tier 0 or highest follower count)
function getCelebrityUserIds() {
  // Tier 0 = influencer
  const celebrities = ALL_USERS.filter(
    (u) => u.tier === 0 || u.tierLabel === "influencer",
  );
  if (celebrities.length > 0) return celebrities.map((u) => u.userId);
  return ALL_USERS.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
    .slice(0, 3)
    .map((u) => u.userId);
}

function logAutoFollow(entry) {
  const logPath = path.join(process.cwd(), "logs", "auto-follow.json");
  let logs = [];
  try {
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, "utf8"));
    }
  } catch (e) {
    logs = [];
  }
  logs.unshift(entry); // newest first
  if (logs.length > 1000) logs = logs.slice(0, 1000);
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

// Helper: create a new user, update profile image, and follow celebrities
function generateUniqueCredentials() {
  const timestamp = Date.now(); // ms since epoch — always unique
  const randomPart = crypto
    .getRandomValues(new Uint32Array(1))[0]
    .toString(36)
    .padStart(7, "0");
  const uuid = `${timestamp.toString(36)}${randomPart}`;

  const username = `auto_${uuid}`;
  const email = `${username}@snaplink.dev`;
  const password = `Auto!${uuid.slice(0, 8)}@123`;
  const name = `AutoUser ${uuid.slice(0, 6)}`;

  // Guaranteed unique 10-digit phone (no leading 0)
  const phone = (() => {
    const tsPart = (timestamp % 900000000).toString().padStart(9, "0");
    const randDigit = Math.floor(1 + Math.random() * 8); // 1-8 for first digit
    return `${randDigit}${tsPart}`;
  })();

  return { uuid, username, email, password, name, phone };
}

async function createAndFollowCelebrities() {
  // 1. Generate unique credentials every single call
  const { uuid, username, email, password, name, phone } =
    generateUniqueCredentials();

  const bio = "Auto-created user";
  const gender = "other";

  const logEntry = {
    timestamp: new Date().toISOString(),
    username,
    email,
    phone,
    actions: [],
  };

  // 2. Signup user
  let signupData;
  try {
    const signupRes = await fetch(
      "https://snaplink-android-app-backend.vercel.app/api/users/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          email,
          password,
          phone,
          bio,
          gender,
        }),
      },
    );
    signupData = await signupRes.json();
    logEntry.actions.push({
      step: "signup",
      status: signupRes.ok && signupData.success ? "ok" : "fail",
      response: signupData,
    });
    if (!signupRes.ok || !signupData.success || !signupData.token) {
      logAutoFollow(logEntry);
      return;
    }
  } catch (e) {
    logEntry.actions.push({
      step: "signup",
      status: "error",
      error: e.message,
    });
    logAutoFollow(logEntry);
    return;
  }

  const token = signupData.token;

  // 3. Update profile image
  try {
    // Cache-busted avatar URL — different image per user
    const avatarUrl = `https://i.pravatar.cc/150?u=${username}&t=${Date.now()}`;
    const imgRes = await fetch(avatarUrl);
    if (!imgRes.ok) throw new Error("Failed to fetch avatar image");

    const buffer = await imgRes.buffer();
    const form = new FormData();
    form.append("image", buffer, {
      filename: `${username}_avatar.jpg`,
      contentType: "image/jpeg",
    });

    const updateRes = await fetch(
      "https://snaplink-android-app-backend.vercel.app/api/users/update-profile-img",
      {
        method: "PUT",
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
        body: form,
      },
    );
    const updateData = await updateRes.json();
    logEntry.actions.push({
      step: "update-profile-img",
      status: updateRes.ok && updateData.success ? "ok" : "fail",
      response: updateData,
    });
  } catch (err) {
    logEntry.actions.push({
      step: "update-profile-img",
      status: "error",
      error: err.message,
    });
  }

  // 4. Follow celebrities
  const celebIds = getCelebrityUserIds();
  for (const celebId of celebIds) {
    try {
      const followRes = await fetch(
        "https://snaplink-android-app-backend.vercel.app/api/users/follow",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: celebId }),
        },
      );
      const followData = await followRes.json();
      logEntry.actions.push({
        step: "follow",
        celebId,
        status: followRes.ok && followData.success ? "ok" : "fail",
        response: followData,
      });
    } catch (err) {
      logEntry.actions.push({
        step: "follow",
        celebId,
        status: "error",
        error: err.message,
      });
    }
  }

  logAutoFollow(logEntry);
}

// ── Toggle auto-follow route ────────────────────────────────────────────────
router.post("/toggle-auto-follow", async (req, res) => {
  if (!autoFollowActive) {
    // Start interval
    autoFollowActive = true;
    autoFollowInterval = setInterval(createAndFollowCelebrities, 5000); // every 5s
    res.json({
      success: true,
      started: true,
      message: "Auto-follow started",
      timestamp: new Date().toISOString(),
    });
  } else {
    // Stop interval
    autoFollowActive = false;
    if (autoFollowInterval) clearInterval(autoFollowInterval);
    autoFollowInterval = null;
    res.json({
      success: true,
      stopped: true,
      message: "Auto-follow stopped",
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Engine controls ───────────────────────────────────────────────────────────
router.post("/start", async (req, res) => {
  const result = await startSimulation();
  res.json({ success: true, ...result, timestamp: new Date().toISOString() });
});

router.post("/stop", (req, res) => {
  const result = stopSimulation();
  res.json({ success: true, ...result, timestamp: new Date().toISOString() });
});

router.post("/pause", (req, res) => {
  const result = pauseSimulation();
  res.json({ success: true, ...result, timestamp: new Date().toISOString() });
});

router.post("/resume", (req, res) => {
  const result = resumeSimulation();
  res.json({ success: true, ...result, timestamp: new Date().toISOString() });
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get("/status", (req, res) => {
  const status = getEngineStatus();
  const stats = getStats();
  const sessions = getSessions();
  res.json({
    engine: status,
    stats,
    onlineCount: sessions.activeSessions?.length ?? 0,
    timestamp: new Date().toISOString(),
  });
});

// ── Logs ──────────────────────────────────────────────────────────────────────
router.get("/logs", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? "100", 10), 1000);
  const type = req.query.type ?? null; // e.g. ?type=like
  const logs = getActivity(limit, type);
  res.json({
    total: logs.length,
    limit,
    filterType: type,
    logs,
    timestamp: new Date().toISOString(),
  });
});

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get("/sessions", (req, res) => {
  const sessions = getSessions();
  res.json({
    ...sessions,
    count: sessions.activeSessions?.length ?? 0,
    timestamp: new Date().toISOString(),
  });
});
// ── Auto-follow log viewer ─────────────────────────────────────────────────--
router.get("/auto-follow-log", (req, res) => {
  const logPath = path.join(process.cwd(), "logs", "auto-follow.json");
  let logs = [];
  try {
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath, "utf8"));
    }
  } catch (e) {
    logs = [];
  }
  res.json({ total: logs.length, logs });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", (req, res) => {
  res.json({ ...getStats(), timestamp: new Date().toISOString() });
});

// ── Users ─────────────────────────────────────────────────────────────────────
router.get("/users", (req, res) => {
  const tier = req.query.tier; // ?tier=influencer | active | regular
  let users = ALL_USERS;
  if (tier) users = users.filter((u) => u.tierLabel === tier);
  res.json({
    total: users.length,
    existingCount: EXISTING_USERS.length,
    newCount: NEW_USERS.length,
    users: users.map((u) => ({
      username: u.username,
      name: u.name,
      email: u.email,
      tier: u.tier,
      tierLabel: u.tierLabel,
      gender: u.gender,
      bio: u.bio,
      userId: u.userId ?? "NEW_USER",
    })),
    timestamp: new Date().toISOString(),
  });
});

// ── Config update ──────────────────────────────────────────────────────────────
router.patch("/config", (req, res) => {
  const updated = updateConfig(req.body);
  res.json({
    success: true,
    config: updated,
    timestamp: new Date().toISOString(),
  });
});

export default router;
