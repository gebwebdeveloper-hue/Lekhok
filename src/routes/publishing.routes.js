import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { validate } from "../middlewares/validate.middleware.js";
import { ApiError } from "../middlewares/error.middleware.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env.js";
import { sendFreePublishingEmail, sendSelfPublishingPlanEmail, sendSelfPublishingUserConfirmationEmail } from "../services/mail.service.js";
import { freePublishingSchema, selfPublishingPlanSchema } from "../utils/validators.js";

const router = Router();
const uploadDir = path.resolve("uploads/publishing-manuscripts");
fs.mkdirSync(uploadDir, { recursive: true });

const manuscriptUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, uploadDir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      cb(null, `${Date.now()}-${safeBase}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = [".pdf", ".doc", ".docx"];
    if (!allowedExts.includes(ext)) {
      return cb(new ApiError(400, "Only PDF and Word documents (.doc, .docx) under 10MB are allowed."));
    }
    cb(null, true);
  }
}).single("manuscript");

function uploadManuscript(req, res, next) {
  manuscriptUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(400, "Manuscript file must be under 10MB."));
    }
    return next(error);
  });
}

router.post("/free", uploadManuscript, validate(freePublishingSchema), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "Please upload your manuscript (PDF/DOCX) under 10MB.");

    let adminEmailSent = false;
    try {
      await sendFreePublishingEmail({ ...req.body, manuscript: req.file });
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about free publishing application:", error);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});


const PLAN_PRICES = {
  basic: { base: 4999, gst: 899.82, total: 5898.82, name: "Basic Publishing Plan" },
  essential: { base: 7999, gst: 1439.82, total: 9438.82, name: "Essential Publishing Plan" },
  popular: { base: 11999, gst: 2159.82, total: 14158.82, name: "Popular Publishing Plan" },
};

function getPlanPricing(planName) {
  const norm = String(planName || "").toLowerCase();
  if (norm.includes("essential")) return PLAN_PRICES.essential;
  if (norm.includes("popular")) return PLAN_PRICES.popular;
  return PLAN_PRICES.basic;
}

router.post("/create-order", async (req, res, next) => {
  try {
    const { planName, name, email, phone } = req.body;
    const keyId = env.razorpayKeyId;
    const keySecret = env.razorpayKeySecret;
    if (!keyId || !keySecret) {
      throw new ApiError(500, "Razorpay API keys are not configured on the server.");
    }

    const pricing = getPlanPricing(planName);
    const amountInPaise = Math.round(pricing.total * 100);
    const receipt = `pub_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const razorpayOrder = await instance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        planName: planName || pricing.name,
        userEmail: email || "",
        userName: name || "",
        userPhone: phone || ""
      }
    });

    res.status(201).json({
      success: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || "INR",
      keyId,
      pricing
    });
  } catch (error) {
    next(error);
  }
});

router.post("/verify-payment", async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new ApiError(400, "Missing Razorpay verification parameters.");
    }

    const keySecret = env.razorpayKeySecret;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new ApiError(400, "Invalid Razorpay payment signature.");
    }

    res.json({
      success: true,
      message: "Payment verified successfully.",
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    next(error);
  }
});

router.post("/plan", uploadManuscript, validate(selfPublishingPlanSchema), async (req, res, next) => {
  try {
    let adminEmailSent = false;
    let userEmailSent = false;

    try {
      await sendSelfPublishingPlanEmail({ ...req.body, manuscript: req.file });
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about self publishing plan inquiry:", error);
    }

    try {
      await sendSelfPublishingUserConfirmationEmail({ ...req.body });
      userEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to send user confirmation email for self publishing:", error);
    }

    res.status(201).json({ success: true, adminEmailSent, userEmailSent });
  } catch (error) {
    next(error);
  }
});
export default router;
