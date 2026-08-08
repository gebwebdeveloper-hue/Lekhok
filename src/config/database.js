import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase(retries = 5, delay = 3000) {
  mongoose.set("strictQuery", true);
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log("MongoDB connected successfully");
      return;
    } catch (error) {
      console.error(`[MongoDB] Connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt === retries) {
        throw error;
      }
      console.log(`[MongoDB] Retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}