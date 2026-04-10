/**
 * server.js — SnapLink Simulation Backend
 * ─────────────────────────────────────────
 * Port : 1912
 * Run  : node server.js   (or: npm start)
 * Dev  : npm run dev      (auto-restarts on file change)
 *
 * REST endpoints (all prefixed /api/sim):
 *   POST   /api/sim/start    — start the simulation
 *   POST   /api/sim/stop     — stop the simulation
 *   POST   /api/sim/pause    — pause all user loops
 *   POST   /api/sim/resume   — resume paused loops
 *   GET    /api/sim/status   — engine health + config
 *   GET    /api/sim/logs     — activity log [ ?limit=N  ?type=like ]
 *   GET    /api/sim/sessions — currently online virtual users
 *   GET    /api/sim/stats    — rolling counters
 *   GET    /api/sim/users    — full user roster [ ?tier=influencer ]
 *   PATCH  /api/sim/config   — live-update engine settings
 *   GET    /health           — quick health-check
 *   GET    /                 — server info JSON
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import simulationRoutes from "./routes/simulation.js";
import { getStats } from "./lib/logger.js";
import { seedPostCache } from "./lib/simulationEngine.js";
import { loadTrackerPosts } from "./scripts/seedPostCache.js";

dotenv.config();

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.SIM_PORT ?? 8080;

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/sim", simulationRoutes);

// Root info
app.get("/", (req, res) => {
  res.json({
    name: "SnapLink Simulation Backend",
    version: "1.0.0",
    port: PORT,
    description: "Simulates real multi-user activity on the SnapLink API",
    endpoints: {
      "POST /api/sim/start": "Start the simulation engine",
      "POST /api/sim/stop": "Stop the simulation engine",
      "POST /api/sim/pause": "Pause all user loops",
      "POST /api/sim/resume": "Resume paused loops",
      "GET  /api/sim/status": "Engine status + config",
      "GET  /api/sim/logs": "Activity log (?limit=N&type=like)",
      "GET  /api/sim/sessions": "Online virtual users",
      "GET  /api/sim/stats": "Rolling action counters",
      "GET  /api/sim/users": "User roster (?tier=influencer)",
      "PATCH /api/sim/config": "Update engine config live",
      "POST /api/sim/toggle-auto-follow":
        "Toggle auto-create new users and follow celebrities (start/stop)",
    },
    timestamp: new Date().toISOString(),
  });
});

// Health-check
app.get("/health", (req, res) => {
  const stats = getStats();
  res.json({
    status: "ok",
    uptime: process.uptime(),
    totalActions: stats.totalActions ?? 0,
    activeUsers: stats.activeUsers ?? 0,
    timestamp: new Date().toISOString(),
  });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  // Pre-load known posts from the tracker so users can start liking from second 0
  const trackerPosts = loadTrackerPosts();
  if (trackerPosts.length) {
    seedPostCache(trackerPosts);
    console.log(
      `\n📦 Seeded ${trackerPosts.length} posts from tracker/posts.json into post cache`,
    );
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`🌐 SnapLink Simulation Backend`);
  console.log(`   Listening on  : http://localhost:${PORT}`);
  console.log(`   Start sim     : POST http://localhost:${PORT}/api/sim/start`);
  console.log(`   Live logs     : GET  http://localhost:${PORT}/api/sim/logs`);
  console.log(
    `   Live sessions : GET  http://localhost:${PORT}/api/sim/sessions`,
  );
  console.log(`   Health        : GET  http://localhost:${PORT}/health`);
  console.log(`${"═".repeat(60)}\n`);
  console.log(`💡 Tip: Send POST /api/sim/start to begin the simulation.\n`);
});

export default app;
