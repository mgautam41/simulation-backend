/**
 * apiClient.js — Thin wrapper around node-fetch for calling the SnapLink API.
 * All calls go to BASE_URL defined in .env (defaults to production Vercel URL).
 */

import fetch from "node-fetch";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

export const BASE_URL =
  process.env.SNAPLINK_API_URL ??
  "https://snaplink-android-app-backend.vercel.app";

// ── Generic JSON request ──────────────────────────────────────────────────────
export const api = async (method, path, body = null, token = null) => {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err.message };
  }
};

// ── Multipart (post with images) ──────────────────────────────────────────────
export const apiMultipart = async (path, fields, imageUrls, token) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  }
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const imgRes = await fetch(imageUrls[i]);
      if (!imgRes.ok) continue;
      const buffer = await imgRes.buffer();
      form.append("media", buffer, {
        filename: `photo_${i + 1}.jpg`,
        contentType: "image/jpeg",
      });
    } catch { /* skip bad images */ }
  }
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
      body: form,
    });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err.message };
  }
};
