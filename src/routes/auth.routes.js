import { Router } from "express";
import {
  getMe, logout,
  sendOtp, verifyOtpLogin,
  register, login,
  forgotPassword, resetPassword,
  googleLogin
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  sendOtpSchema, verifyOtpSchema,
  registerSchema, loginSchema,
  forgotPasswordSchema, resetPasswordSchema
} from "../utils/validators.js";

const router = Router();

// Legacy OTP-based auth (admin bypass + book purchase flow)
router.post("/send-otp", validate(sendOtpSchema), sendOtp);
router.post("/verify-otp", validate(verifyOtpSchema), verifyOtpLogin);

// Email + Password auth
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

// Google Auth
router.post("/google", googleLogin);

// Session
router.get("/me", requireAuth, getMe);
router.post("/logout", logout);

export default router;