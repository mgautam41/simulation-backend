/**
 * routes/simulation.js — REST API routes for the simulation server.
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
import crypto from "crypto";
import fetch from "node-fetch";
import FormData from "form-data";

const router = Router();

// ── Auto-follow toggle state
let autoFollowInterval = null;
let autoFollowActive = false;

// ── Get celebrity usernames (tier 0 / influencer)
function getCelebrityUsernames() {
  const celebrities = ALL_USERS.filter(
    (u) => u.tier === 0 || u.tierLabel === "influencer",
  );
  if (celebrities.length > 0) return celebrities.map((u) => u.username);
  return ALL_USERS.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
    .slice(0, 3)
    .map((u) => u.username);
}

// ── Log auto-follow entry to file
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
  logs.unshift(entry);
  if (logs.length > 1000) logs = logs.slice(0, 1000);
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
}

// ── Fetch genuine random user from randomuser.me API
async function generateUniqueCredentials() {
  const timestamp = Date.now();
  const randomPart = crypto
    .randomBytes(4)
    .readUInt32BE(0)
    .toString(36)
    .padStart(5, "0");

  // Unique 10-digit phone (no leading 0)
  const phone = (() => {
    const tsPart = (timestamp % 900000000).toString().padStart(9, "0");
    const randDigit = Math.floor(1 + Math.random() * 8);
    return `${randDigit}${tsPart}`;
  })();

  try {
    // Fetch a real random person from randomuser.me
    const res = await fetch("https://randomuser.me/api/?nat=in,us,gb,au");
    const data = await res.json();
    const person = data.results[0];

    const firstName = person.name.first.toLowerCase().replace(/\s+/g, "");
    const lastName = person.name.last.toLowerCase().replace(/\s+/g, "");
    const fullName = `${person.name.first} ${person.name.last}`;
    const gender = person.gender; // "male" or "female"

    // e.g. john_smith_a3f2
    const username = `${firstName}_${lastName}_${randomPart}`;
    // e.g. john.smith_a3f2@snaplink.demouser
    const email = `${firstName}.${lastName}_${randomPart}@snaplink.demouser`;
    const password = `Demo!${randomPart}@${timestamp.toString(36).slice(-4)}`;
    const bio = `Hi, I'm ${person.name.first}! 👋`;

    return { username, email, password, name: fullName, phone, bio, gender };
  } catch (err) {
    // Fallback if randomuser.me is unreachable
    console.warn(
      "[generateUniqueCredentials] randomuser.me failed, using fallback:",
      err.message,
    );
    const username = `user_${timestamp.toString(36)}${randomPart}`;
    const email = `${username}@snaplink.demouser`;
    const password = `Demo!${randomPart}@123`;
    return {
      username,
      email,
      password,
      name: `Demo User`,
      phone,
      bio: "Auto-created demo user",
      gender: "other",
    };
  }
}

// ── Core: create one new user and follow all celebrities
async function createAndFollowCelebrities() {
  const { username, email, password, name, phone, bio, gender } =
    await generateUniqueCredentials();

  const logEntry = {
    timestamp: new Date().toISOString(),
    username,
    email,
    phone,
    name,
    actions: [],
  };

  // 1. Signup
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

  // 2. Update profile image
  try {
    // Use username as pravatar seed for consistent unique avatar
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

  // 3. Follow celebrities — username passed as URL param /:username
  const celebUsernames = getCelebrityUsernames();
  for (const celebUsername of celebUsernames) {
    try {
      const followRes = await fetch(
        `https://snaplink-android-app-backend.vercel.app/api/users/follow/${celebUsername}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const followData = await followRes.json();
      logEntry.actions.push({
        step: "follow",
        celebUsername,
        status: followRes.ok && followData.success ? "ok" : "fail",
        response: followData,
      });
    } catch (err) {
      logEntry.actions.push({
        step: "follow",
        celebUsername,
        status: "error",
        error: err.message,
      });
    }
  }

  logAutoFollow(logEntry);
}

// ── Toggle auto-follow ────────────────────────────────────────────────────────
router.post("/toggle-auto-follow", async (req, res) => {
  if (!autoFollowActive) {
    autoFollowActive = true;
    autoFollowInterval = setInterval(createAndFollowCelebrities, 5000);
    res.json({
      success: true,
      started: true,
      message: "Auto-follow started (1 new user every 5s)",
      timestamp: new Date().toISOString(),
    });
  } else {
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
  const type = req.query.type ?? null;
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

// ── Auto-follow log viewer ────────────────────────────────────────────────────
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
  const tier = req.query.tier;
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

// ── Config update ─────────────────────────────────────────────────────────────
router.patch("/config", (req, res) => {
  const updated = updateConfig(req.body);
  res.json({
    success: true,
    config: updated,
    timestamp: new Date().toISOString(),
  });
});

export default router;
