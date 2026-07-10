import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const Otp = mongoose.model("Otp", otpSchema);