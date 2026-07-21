import { Router } from "express";
import {
  createNewsletter,
  deleteNewsletter,
  getNewsletterBySlug,
  listNewsletters,
  updateNewsletter,
  uploadInlineImage,
  submitAccessRequest,
  checkAccessStatus,
  listAccessRequests,
  updateAccessRequestStatus
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
import { sendSubscriptionEmail } from "../services/mail.service.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
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
    let adminEmailSent = false;
    try {
      await sendSubscriptionEmail(email);
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about newsletter subscription:", error);
    }
    res.status(200).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});

// Story payment access request & verification endpoints
router.post("/access-request", validate(newsletterAccessRequestSchema), submitAccessRequest);
router.get("/access-status", checkAccessStatus);

// Single story endpoint
router.get("/:slug", optionalAuth, getNewsletterBySlug);

// Admin-only endpoints
router.get("/admin/access-requests", requireAuth, requireRole("admin"), listAccessRequests);
router.put("/admin/access-requests/:id/status", requireAuth, requireRole("admin"), updateAccessRequestStatus);
router.post("/", requireAuth, requireRole("admin"), newsletterUpload, validate(newsletterCreateSchema), createNewsletter);
router.put("/:id", requireAuth, requireRole("admin"), newsletterUpload, validate(newsletterUpdateSchema), updateNewsletter);
router.delete("/:id", requireAuth, requireRole("admin"), validate(idParamSchema), deleteNewsletter);
router.post("/upload-inline", requireAuth, requireRole("admin"), inlineImageUpload, uploadInlineImage);

export default router;
