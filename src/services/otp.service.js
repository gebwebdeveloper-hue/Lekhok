import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Otp } from "../models/Otp.js";
import { env } from "../config/env.js";
import { sendOtpEmail } from "./mail.service.js";
import { ApiError } from "../middlewares/error.middleware.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function createAndSendOtp(email) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

  if (existing && Date.now() - existing.lastSentAt.getTime() < env.otpResendSeconds * 1000) {
    throw new ApiError(429, `Please wait ${env.otpResendSeconds} seconds before requesting another OTP.`);
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);

  await Otp.deleteMany({ email: normalizedEmail });
  await Otp.create({ email: normalizedEmail, otpHash, expiresAt, lastSentAt: new Date() });
  await sendOtpEmail(normalizedEmail, otp);

  return {
    devOtp: env.nodeEnv !== "production" && !env.smtpConfigured ? otp : undefined
  };
}

export async function verifyOtp(email, otp) {
  const normalizedEmail = normalizeEmail(email);
  const record = await Otp.findOne({ email: normalizedEmail }).sort({ createdAt: -1 });

  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, "OTP expired or not found. Please request a new OTP.");
  }

  if (record.attempts >= 5) {
    throw new ApiError(429, "Too many OTP attempts. Please request a new OTP.");
  }

  const ok = await bcrypt.compare(String(otp), record.otpHash);
  if (!ok) {
    record.attempts += 1;
    await record.save();
    throw new ApiError(400, "Invalid OTP.");
  }

  await Otp.deleteMany({ email: normalizedEmail });
  return normalizedEmail;
}