/**
 * scripts/seedPostCache.js
 * ─────────────────────────
 * Pre-populates the simulation's in-memory post cache from the existing
 * tracker/posts.json file so users can immediately start liking/commenting
 * on real posts that already exist in the database.
 *
 * This script exports a helper used by server.js at startup.
 * It can also be called standalone: node scripts/seedPostCache.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const POSTS_FILE = path.join(__dir, "..", "..", "tracker", "posts.json");

/**
 * Load posts from tracker/posts.json.
 * Returns an array of { postId, postedBy, postedByUserId, caption } objects.
 * Returns [] if the file doesn't exist.
 */
export const loadTrackerPosts = () => {
  if (!fs.existsSync(POSTS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.map((p) => ({
      postId: p.postId,
      postedBy: p.postedBy,
      postedByUserId: p.postedByUserId ?? null,
      caption: p.caption ?? "",
    }));
  } catch {
    return [];
  }
};

// When called directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const posts = loadTrackerPosts();
  console.log(`\n📦 Found ${posts.length} posts in tracker/posts.json`);
  if (posts.length) {
    console.log(`   Sample: postId=${posts[0].postId} by @${posts[0].postedBy}`);
  }
  console.log("\nDone. These posts will be used as initial targets for likes/comments.\n");
}
