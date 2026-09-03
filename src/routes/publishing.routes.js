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

import { createOrUpdateAuthorFromForm } from "../utils/authorAuth.js";

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

    // Auto-create Author account & email credentials
    try {
      await createOrUpdateAuthorFromForm({
        ...req.body,
        planName: "Free Sponsored Publishing"
      });
    } catch (authErr) {
      console.error("[AuthorPortal] Failed to create author account for free publishing:", authErr);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});



const ADDON_PRICES = {
  "Professional Cover Design": 3000,
  "Book Trailer / Promotional Video": 3000,
  "Social Media Marketing": 1000,
  "Author Website": 6200,
  "Book Launch Event": 10000,
  "Press Release": 10000,
  "Author Interview": 25000,
  "Book Review Campaign": 10000,
  "Printed Bookmarks": 500,
  "Posters": 50,
  "Author Visiting Card": 500,
  "QR Code for Book": 100,
  "Copyright Registration Assistance": 6000,
  "Translation Service": 10000,
  "Audiobook Publishing": 10000,
  "Premium Cover Finish (Matte / Gloss / Spot UV)": 2000,
  "Amazon A+ Content": 3000,
  "Roll-up Standee": 1500,
};

function getPlanPricing(planName, addons = [], isClubMember = false) {
  const norm = String(planName || "").toLowerCase();
  let rawBase = 4999;
  let name = "Basic Publishing Plan";
  if (norm.includes("essential")) {
    rawBase = 9999;
    name = "Essential Publishing Plan";
  } else if (norm.includes("popular")) {
    rawBase = 14999;
    name = "Popular Publishing Plan";
  }

  const base = isClubMember ? Math.round(rawBase * 0.90 * 100) / 100 : rawBase;

  let addonsTotal = 0;
  if (Array.isArray(addons)) {
    addons.forEach((addonName) => {
      if (typeof addonName === "string" && addonName.toLowerCase().includes("poster")) {
        const match = addonName.match(/(\d+)/);
        const count = match ? parseInt(match[1], 10) : 1;
        addonsTotal += 50 * count;
      } else {
        for (const [key, price] of Object.entries(ADDON_PRICES)) {
          if (addonName === key || addonName.startsWith(key) || key.startsWith(addonName)) {
            addonsTotal += price;
            break;
          }
        }
      }
    });
  }

  const subtotal = base + addonsTotal;
  const gst = subtotal * 0.18;
  const total = subtotal + gst;

  const hasRegistrationFee = !norm.includes("starter");
  const regBase = 1000;
  const regGst = Math.round(regBase * 0.18 * 100) / 100;
  const regTotal = regBase + regGst; // 1180.00
  const registrationFee = hasRegistrationFee ? regTotal : total;
  const remainingBase = hasRegistrationFee ? Math.max(0, base - regBase) : 0;
  const remainingToPayLater = hasRegistrationFee ? Math.max(0, base - regBase + addonsTotal) : 0;

  return { name, base, rawBase, isClubMember, addonsTotal, subtotal, gst, total, hasRegistrationFee, regBase, regGst, regTotal, registrationFee, remainingBase, remainingToPayLater };
}

router.post("/create-order", async (req, res, next) => {
  try {
    const { planName, name, email, phone, addons, isClubMember } = req.body;
    const keyId = env.razorpayKeyId;
    const keySecret = env.razorpayKeySecret;
    if (!keyId || !keySecret) {
      throw new ApiError(500, "Razorpay API keys are not configured on the server.");
    }

    const pricing = getPlanPricing(planName, addons, !!isClubMember);
    const chargeAmount = pricing.hasRegistrationFee ? pricing.regTotal : pricing.total;
    const amountInPaise = Math.round(chargeAmount * 100);
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
        userPhone: phone || "",
        registrationFeePaid: pricing.hasRegistrationFee ? pricing.regTotal : pricing.total,
        remainingBalanceDue: pricing.remainingToPayLater,
        purpose: pricing.hasRegistrationFee ? "Plan Registration Fee (₹1,000 + 18% GST = ₹1,180)" : "Plan Full Payment",
        addonsCount: Array.isArray(addons) ? addons.length : 0
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

    // Auto-create Author account & email credentials
    try {
      await createOrUpdateAuthorFromForm({
        ...req.body
      });
    } catch (authErr) {
      console.error("[AuthorPortal] Failed to create author account for self publishing plan:", authErr);
    }

    res.status(201).json({ success: true, adminEmailSent, userEmailSent });
  } catch (error) {
    next(error);
  }
});

export default router;
