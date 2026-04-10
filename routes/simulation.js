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

import fetch from "node-fetch";
import FormData from "form-data";

const router = Router();

// ── Auto-follow toggle state and logic ───────────────────────────────────────
let autoFollowInterval = null;
let autoFollowActive = false;

// Helper: get celebrity/most-followed users (tier 0 or highest follower count)
function getCelebrityUserIds() {
  // Tier 0 = influencer
  const celebrities = ALL_USERS.filter(
    (u) => u.tier === 0 || u.tierLabel === "influencer",
  );
  // If no tier, fallback to top 3 by followers
  if (celebrities.length > 0) return celebrities.map((u) => u.userId);
  // fallback: sort by followers (if present)
  return ALL_USERS.sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
    .slice(0, 3)
    .map((u) => u.userId);
}

// Helper: create a new user, update profile image, and follow celebrities
async function createAndFollowCelebrities() {
  // 1. Generate random credentials
  const uuid = Math.random().toString(36).slice(2, 10);
  const username = `auto_${uuid}`;
  const email = `${username}@snaplink.dev`;
  const password = `Auto!${uuid}@123`;
  const name = `AutoUser ${uuid}`;
  const bio = "Auto-created user";
  const gender = "other";
  const phone = "9999999999";

  // 2. Signup user
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
  let signupData;
  try {
    signupData = await signupRes.json();
  } catch (e) {
    console.error("[auto-follow] Signup response not JSON", e);
    return;
  }
  if (!signupRes.ok || !signupData.success || !signupData.token) {
    console.error(
      `[auto-follow] Signup failed for ${username}:`,
      signupData?.message || signupData,
    );
    return;
  }
  const token = signupData.token;

  // 3. Update profile image
  try {
    const avatarUrl = `https://i.pravatar.cc/150?u=${username}`;
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
    if (!updateRes.ok || !updateData.success) {
      console.error(
        `[auto-follow] Profile image update failed for ${username}:`,
        updateData?.message || updateData,
      );
    }
  } catch (err) {
    console.error(`[auto-follow] Profile image error for ${username}:`, err);
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
      if (!followRes.ok || !followData.success) {
        console.error(
          `[auto-follow] Follow failed for ${username} -> ${celebId}:`,
          followData?.message || followData,
        );
      }
    } catch (err) {
      console.error(
        `[auto-follow] Follow error for ${username} -> ${celebId}:`,
        err,
      );
    }
  }
  // Do not log or persist this user locally
  console.log(
    `[auto-follow] Created user ${username}, updated avatar, followed:`,
    celebIds,
  );
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
