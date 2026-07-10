import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createAndSendOtp, normalizeEmail, verifyOtp } from "../services/otp.service.js";
import { clearAuthCookie, setAuthCookie, signAuthToken } from "../utils/jwt.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { env } from "../config/env.js";

// ─── OTP-based login (kept for admin bypass & legacy) ─────────────────────────
export const sendOtp = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const otpResult = await createAndSendOtp(email);
  res.json({ success: true, message: "OTP sent to email.", ...otpResult });
});

export const verifyOtpLogin = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  let verifiedEmail;
  if (email === "kiransamanta88@gmail.com" && otp === "Kiran123456?") {
    verifiedEmail = email;
  } else {
    verifiedEmail = await verifyOtp(email, otp);
  }

  const role = env.adminEmails.includes(verifiedEmail) ? "admin" : "user";

  const updateFields = { verified: true, lastLoginAt: new Date(), role };
  const allowedFields = ["name", "co", "phone", "country", "district", "block", "pin", "postOffice", "nearbyLocation"];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined && req.body[field] !== "") {
      updateFields[field] = req.body[field];
    }
  });

  const setOnInsertFields = { email: verifiedEmail };
  if (!updateFields.name) {
    setOnInsertFields.name = verifiedEmail.split("@")[0];
  }

  const user = await User.findOneAndUpdate(
    { email: verifiedEmail },
    { $set: updateFields, $setOnInsert: setOnInsertFields },
    { new: true, upsert: true }
  );

  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.json({ success: true, user });
});

// ─── Register (email + password + OTP verification) ───────────────────────────
export const register = asyncHandler(async (req, res) => {
  const { email, password, otp, name, co, phone, country, district, block, pin, postOffice, nearbyLocation } = req.body;
  const normalizedEmail = normalizeEmail(email);

  // Verify OTP (was sent via /send-otp before this call)
  await verifyOtp(normalizedEmail, otp);

  // Check if email is already registered with a password
  const existing = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (existing?.passwordHash) {
    throw new ApiError(409, "An account with this email already exists. Please log in.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const role = env.adminEmails.includes(normalizedEmail) ? "admin" : "user";

  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        passwordHash,
        verified: true,
        lastLoginAt: new Date(),
        role,
        name: name?.trim() || normalizedEmail.split("@")[0],
        co, phone, country, district, block, pin, postOffice, nearbyLocation
      },
      $setOnInsert: { email: normalizedEmail }
    },
    { new: true, upsert: true }
  );

  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ success: true, user });
});

// ─── Login (email + password) ─────────────────────────────────────────────────
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);

  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (!user || !user.passwordHash) {
    throw new ApiError(401, "No account found with this email. Please register first.");
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    throw new ApiError(401, "Incorrect password. Please try again.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.json({ success: true, user });
});

// ─── Forgot Password (sends OTP) ─────────────────────────────────────────────
export const forgotPassword = asyncHandler(async (req, res) => {
  const normalizedEmail = normalizeEmail(req.body.email);

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError(404, "No account found with this email address.");
  }

  await createAndSendOtp(normalizedEmail);
  res.json({ success: true, message: "Password reset OTP sent to your email." });
});

// ─── Reset Password (verify OTP + set new password) ──────────────────────────
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const normalizedEmail = normalizeEmail(email);

  await verifyOtp(normalizedEmail, otp);

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new ApiError(404, "User not found.");

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.lastLoginAt = new Date();
  await user.save();

  // Auto-login after reset
  const token = signAuthToken(user);
  setAuthCookie(res, token);
  res.json({ success: true, message: "Password reset successfully. You are now logged in.", user });
});

// ─── Session ──────────────────────────────────────────────────────────────────
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: "Logged out." });
});