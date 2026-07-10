import { Router } from "express";
import { adminPurchases, approvePurchase, createPurchaseRequest, myPurchases, rejectPurchase } from "../controllers/purchase.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { paymentUpload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { adminNoteSchema, purchaseCreateSchema } from "../utils/validators.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/config", (req, res) => {
  res.json({ success: true, upiId: env.upiId, upiQrImageUrl: env.upiQrImageUrl });
});

router.post("/", requireAuth, paymentUpload, validate(purchaseCreateSchema), createPurchaseRequest);
router.get("/me", requireAuth, myPurchases);
router.get("/admin", requireAuth, requireRole("admin"), adminPurchases);
router.patch("/:id/approve", requireAuth, requireRole("admin"), validate(adminNoteSchema), approvePurchase);
router.patch("/:id/reject", requireAuth, requireRole("admin"), validate(adminNoteSchema), rejectPurchase);

export default router;