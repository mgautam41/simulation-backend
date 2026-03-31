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

const router = Router();

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
  res.json({ success: true, config: updated, timestamp: new Date().toISOString() });
});

export default router;
