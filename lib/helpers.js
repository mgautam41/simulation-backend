/**
 * helpers.js — Pure utility functions used across the simulation.
 */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Pick n unique items from arr (shuffled) */
export const pickN = (arr, n) =>
  [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));

/** Weighted random boolean — probability is 0..1 */
export const chance = (probability) => Math.random() < probability;

/**
 * Decode a JWT payload without verification.
 * Returns null on failure.
 */
export const decodeJwt = (token) => {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8"),
    );
  } catch {
    return null;
  }
};

/**
 * Extract userId from a login response using multiple possible keys.
 * Falls back to JWT payload if nothing is found in the response body.
 */
export const extractUserId = (data, token) => {
  const fromBody =
    data.user?._id ??
    data.user?.id ??
    data.userData?._id ??
    data.userData?.id ??
    data.userDetails?._id ??
    data._id ??
    data.id ??
    null;
  if (fromBody) return fromBody;
  const payload = decodeJwt(token);
  return payload?.id ?? payload?._id ?? payload?.sub ?? null;
};

/** Generate a Picsum URL that always returns the same image for a given seed */
export const picsumUrl = (seed, width = 800, height = 800) =>
  `https://picsum.photos/seed/${seed}/${width}/${height}`;

/** ISO timestamp for "now" */
export const now = () => new Date().toISOString();

/** Human-readable elapsed time */
export const elapsed = (startMs) => {
  const ms = Date.now() - startMs;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};
