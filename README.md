# SnapLink — Simulation Backend

> A standalone Node.js server that **simulates real multi-user activity** on the SnapLink API, running persistently on **port 1912**.

---

## What It Does

This server spins up **up to 15 concurrent virtual users** (drawn from the 50 original seed users + 15 new synthetic users = **65 total users**). Each user independently:

1. Logs in to the SnapLink API and caches their session
2. Picks a weighted-random action:
   - ❤️ **Like** a post (35% weight — most frequent)
   - 💬 **Comment** on a post (20%)
   - ➕ **Follow** another user (12%)
   - 👁️ **View profile** (10%)
   - 🔖 **Save** a post (10%)
   - 📝 **Create a post** with real images from Picsum (8%)
   - 🔍 **Search** for users (5%)
3. Calls the real SnapLink API
4. Logs the result to `logs/activity.json`
5. Waits a random human-like delay (3–14 s) and repeats

Everything is logged as structured JSON in real-time.

---

## Folder Structure

```
simulation-backend/
├── server.js                    ← Express server on port 1912
├── package.json
├── .env.example
│
├── data/
│   ├── users.js                 ← All 65 users (50 existing + 15 new)
│   └── content.js               ← Captions, comments, locations pool
│
├── lib/
│   ├── simulationEngine.js      ← Core simulation loop
│   ├── apiClient.js             ← node-fetch wrapper for SnapLink API
│   ├── logger.js                ← Structured JSON file logger
│   └── helpers.js               ← Pure utility functions
│
├── routes/
│   └── simulation.js            ← REST API routes
│
├── scripts/
│   ├── resetLogs.js             ← Wipe all log files
│   └── seedPostCache.js         ← Load tracker posts into memory
│
└── logs/                        ← Auto-created on first run
    ├── activity.json            ← Every action (newest first, capped at 5000)
    ├── sessions.json            ← Currently "online" virtual users
    └── stats.json               ← Rolling counters
```

---

## Setup

```bash
# 1. Navigate to the folder
cd seed/simulation-backend

# 2. Install dependencies
npm install

# 3. (Optional) Copy env file
cp .env.example .env

# 4. Start the server
npm start
```

---

## REST API

All endpoints use `http://localhost:1912`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sim/start` | Start the simulation engine |
| `POST` | `/api/sim/stop` | Stop the simulation engine |
| `POST` | `/api/sim/pause` | Pause all user loops |
| `POST` | `/api/sim/resume` | Resume paused loops |
| `GET` | `/api/sim/status` | Engine status, config, uptime |
| `GET` | `/api/sim/logs` | Activity log (`?limit=100&type=like`) |
| `GET` | `/api/sim/sessions` | Currently active virtual users |
| `GET` | `/api/sim/stats` | Rolling action counters |
| `GET` | `/api/sim/users` | Full user roster (`?tier=influencer`) |
| `PATCH` | `/api/sim/config` | Update engine config live |
| `GET` | `/health` | Quick health check |

### Quick Start

```bash
# Start the simulation
curl -X POST http://localhost:1912/api/sim/start

# Watch live activity
curl http://localhost:1912/api/sim/logs?limit=20

# See who is online
curl http://localhost:1912/api/sim/sessions

# View rolling stats
curl http://localhost:1912/api/sim/stats

# Pause
curl -X POST http://localhost:1912/api/sim/pause

# Stop
curl -X POST http://localhost:1912/api/sim/stop
```

### Update Config at Runtime

```bash
curl -X PATCH http://localhost:1912/api/sim/config \
  -H "Content-Type: application/json" \
  -d '{"actionDelayMin": 1000, "actionDelayMax": 5000, "maxConcurrentUsers": 20}'
```

---

## Log Format

### `logs/activity.json`

Each entry:

```json
{
  "id": "1774900000-ab3xy",
  "timestamp": "2026-03-31T17:30:00.000Z",
  "type": "like",
  "status": "success",
  "actor": "sneha_singh13",
  "actorTier": "active",
  "targetUser": "amit_makwana10",
  "targetPost": "69c90c04f55a66da96eff4ae",
  "detail": "Golden hour never disappoints 🌅"
}
```

### `logs/stats.json`

```json
{
  "totalActions": 350,
  "byType": {
    "login": 15, "like": 120, "comment": 70,
    "post": 28, "follow": 40, "save": 35, "search": 20,
    "profile_view": 30, "logout": 2
  },
  "activeUsers": 15,
  "registeredNewUsers": 3
}
```

---

## Users

| Tier | Count | Behaviour |
|------|-------|-----------|
| **influencer** (tier 0) | 3 existing | Followed by everyone, post frequently |
| **active** (tier 1) | 12 existing + 2 new | Regular posters and interactors |
| **regular** (tier 2) | 35 existing + 13 new | Casual users, mostly liking/saving |

All existing user credentials: `Seed@1234` | email: `<username>@snaplink.dev`

---

## Reset Logs

```bash
npm run reset
```

This clears `logs/activity.json`, `logs/sessions.json`, and `logs/stats.json`.
