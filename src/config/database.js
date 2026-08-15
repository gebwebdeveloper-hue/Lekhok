import mongoose from "mongoose";
import { env } from "./env.js";

// ── Cafe Database — separate connection (Menu / Orders / Reservations etc.) ──
export const cafeDb = mongoose.createConnection();

// ── Author & Publisher Database — separate connection ──
export const authorDb = mongoose.createConnection();

export async function connectDatabase(retries = 3, delay = 2000) {
  const localMainUri = "mongodb://127.0.0.1:27017/lekhak";
  const localAuthorUri = "mongodb://127.0.0.1:27017/lekhak-author";
  const localCafeUri = "mongodb://127.0.0.1:27017/lekhak-cafe";

  // ── 1. Main DB Connection ────────────────────────────────────────────────
  let mainConnected = false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log("[MongoDB] Main DB connected successfully");
      mainConnected = true;
      break;
    } catch (error) {
      console.error(`[MongoDB] Main DB attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!mainConnected) {
    if (env.nodeEnv !== "production") {
      console.log(`[MongoDB] Attempting fallback to local MongoDB (${localMainUri})...`);
      try {
        await mongoose.connect(localMainUri, { serverSelectionTimeoutMS: 3000 });
        console.log("[MongoDB] Main DB connected using local MongoDB fallback ✓");
      } catch (fallbackErr) {
        console.error("\n==================================================================");
        console.error("❌ MONGODB ATLAS IP WHITELIST ERROR");
        console.error("Your current IP address is not whitelisted on MongoDB Atlas.");
        console.error("Fix: Go to https://cloud.mongodb.com -> Network Access -> Add IP Address -> 'Allow Access From Anywhere' (0.0.0.0/0)");
        console.error("==================================================================\n");
        throw fallbackErr;
      }
    } else {
      throw new Error("Could not connect to Main MongoDB Atlas cluster.");
    }
  }

  // ── 2. Author & Publisher DB Connection ────────────────────────────────────
  let authorConnected = false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await authorDb.openUri(env.authorMongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log("[MongoDB] Author/Publisher DB connected successfully");
      authorConnected = true;
      break;
    } catch (error) {
      console.error(`[MongoDB] Author DB attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!authorConnected) {
    if (env.nodeEnv !== "production") {
      console.log(`[MongoDB] Attempting Author DB fallback to local MongoDB (${localAuthorUri})...`);
      try {
        await authorDb.openUri(localAuthorUri, { serverSelectionTimeoutMS: 3000 });
        console.log("[MongoDB] Author DB connected using local MongoDB fallback ✓");
      } catch (fallbackErr) {
        console.error("Failed to connect Author DB to Atlas or Local MongoDB.");
      }
    }
  }

  // ── 3. Cafe DB Connection ────────────────────────────────────────────────
  let cafeConnected = false;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await cafeDb.openUri(env.cafeMongoUri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log("[MongoDB] Cafe DB connected successfully");
      cafeConnected = true;
      break;
    } catch (error) {
      console.error(`[MongoDB] Cafe DB attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  if (!cafeConnected) {
    if (env.nodeEnv !== "production") {
      console.log(`[MongoDB] Attempting Cafe DB fallback to local MongoDB (${localCafeUri})...`);
      try {
        await cafeDb.openUri(localCafeUri, { serverSelectionTimeoutMS: 3000 });
        console.log("[MongoDB] Cafe DB connected using local MongoDB fallback ✓");
      } catch (fallbackErr) {
        console.error("Failed to connect Cafe DB to Atlas or Local MongoDB.");
      }
    }
  }
}