import { Router } from "express";
import {
  createNewsletter,
  deleteNewsletter,
  getNewsletterBySlug,
  getNewsletterOgHtml,
  listNewsletters,
  updateNewsletter,
  uploadInlineImage,
  submitAccessRequest,
  checkAccessStatus,
  listAccessRequests,
  updateAccessRequestStatus,
  createStoryRazorpayOrder,
  verifyStoryRazorpayPayment,
  deleteStoryAccessRequest,
  updateStoryAccessRequestDetails,
  refundStoryAccessRequest
} from "../controllers/newsletter.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  newsletterCreateSchema,
  newsletterUpdateSchema,
  newsletterAccessRequestSchema,
  idParamSchema,
  subscribeSchema
} from "../utils/validators.js";
import { sendSubscriptionEmail, sendWelcomeSubscriberEmail } from "../services/mail.service.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Subscriber } from "../models/Subscriber.js";
import { verifyAuthToken } from "../utils/jwt.js";

// Optional authentication middleware for public endpoints
async function optionalAuth(req, _res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.[env.cookieName] || bearer;
    if (token) {
      const payload = verifyAuthToken(token);
      const user = await User.findById(payload.sub);
      if (user) {
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore error, proceed without setting req.user
  }
  next();
}

const router = Router();
const newsletterUpload = upload.fields([{ name: "cover", maxCount: 1 }]);
const inlineImageUpload = upload.single("image");

// Public endpoints
router.get("/", optionalAuth, listNewsletters);
router.post("/subscribe", validate(subscribeSchema), async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = String(email).toLowerCase().trim();

    // 1. Save or update subscriber in DB
    await Subscriber.findOneAndUpdate(
      { email: normalizedEmail },
      { email: normalizedEmail, isActive: true },
      { upsert: true, new: true }
    );

    // 2. Send welcome email to subscriber and notification to admin asynchronously
    sendWelcomeSubscriberEmail(normalizedEmail).catch((err) =>
      console.error("[Email] Error sending welcome subscriber email:", err)
    );
    sendSubscriptionEmail(normalizedEmail).catch((err) =>
      console.error("[Email] Error notifying admin about newsletter subscription:", err)
    );

    res.status(200).json({
      success: true,
      message: "Thank you for subscribing! You will receive email notifications whenever a new book or story is published."
    });
  } catch (error) {
    next(error);
  }
});

// Automated Razorpay Story Payment Endpoints
router.post("/razorpay/create-order", requireAuth, createStoryRazorpayOrder);
router.post("/razorpay/verify", verifyStoryRazorpayPayment);

// Story payment & status endpoints
router.post("/access-request", validate(newsletterAccessRequestSchema), submitAccessRequest);
router.get("/access-status", optionalAuth, checkAccessStatus);

// Public single story reader and Open Graph preview endpoints
router.get("/:slug/og", getNewsletterOgHtml);
router.get("/:slug", optionalAuth, getNewsletterBySlug);

// Admin story access request endpoints
router.get("/admin/access-requests", requireAuth, requireRole("admin"), listAccessRequests);
router.put("/admin/access-requests/:id/status", requireAuth, requireRole("admin"), updateAccessRequestStatus);
router.post("/admin/access-requests/:id/refund", requireAuth, requireRole("admin"), refundStoryAccessRequest);
router.put("/admin/access-requests/:id", requireAuth, requireRole("admin"), updateStoryAccessRequestDetails);
router.delete("/admin/access-requests/:id", requireAuth, requireRole("admin"), deleteStoryAccessRequest);
router.post("/", requireAuth, requireRole("admin"), newsletterUpload, validate(newsletterCreateSchema), createNewsletter);
router.put("/:id", requireAuth, requireRole("admin"), newsletterUpload, validate(newsletterUpdateSchema), updateNewsletter);
router.delete("/:id", requireAuth, requireRole("admin"), validate(idParamSchema), deleteNewsletter);
router.post("/upload-inline", requireAuth, requireRole("admin"), inlineImageUpload, uploadInlineImage);

export default router;
