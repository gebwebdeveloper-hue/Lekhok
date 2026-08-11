import { Router } from "express";
import { adminPurchases, approvePurchase, createPurchaseRequest, createBatchPurchaseRequests, myPurchases, rejectPurchase, getPaymentConfig, updatePaymentConfig, updateShipmentStatus, getPurchaseInvoice, createRazorpayOrder, verifyRazorpayPayment, deletePurchase, updatePurchaseDetails, processRefund, checkDeliveryPincode, syncPurchaseToShiprocket, autoSyncShiprocketTracking } from "../controllers/purchase.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { paymentUpload, upload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { adminNoteSchema, purchaseCreateSchema, batchPurchaseSchema, updateShipmentSchema } from "../utils/validators.js";
import { env } from "../config/env.js";

const router = Router();

router.get("/config", getPaymentConfig);
router.put("/config", requireAuth, requireRole("admin"), upload.single("upiQrImage"), updatePaymentConfig);
router.get("/check-pincode/:pincode", checkDeliveryPincode);

// Automated Razorpay Payment Endpoints
router.post("/razorpay/create-order", requireAuth, createRazorpayOrder);
router.post("/razorpay/verify", requireAuth, verifyRazorpayPayment);

router.post("/", requireAuth, paymentUpload, validate(purchaseCreateSchema), createPurchaseRequest);
router.post("/batch", requireAuth, paymentUpload, validate(batchPurchaseSchema), createBatchPurchaseRequests);
router.get("/me", requireAuth, myPurchases);
router.get("/admin", requireAuth, requireRole("admin"), adminPurchases);
router.get("/:id/invoice", requireAuth, getPurchaseInvoice);
router.patch("/:id/approve", requireAuth, requireRole("admin"), validate(adminNoteSchema), approvePurchase);
router.post("/:id/sync-shiprocket", requireAuth, requireRole("admin"), syncPurchaseToShiprocket);
router.post("/:id/auto-sync-tracking", requireAuth, autoSyncShiprocketTracking);
router.patch("/:id/reject", requireAuth, requireRole("admin"), validate(adminNoteSchema), rejectPurchase);
router.patch("/:id/shipment", requireAuth, requireRole("admin"), validate(updateShipmentSchema), updateShipmentStatus);
router.post("/:id/refund", requireAuth, requireRole("admin"), processRefund);
router.put("/:id", requireAuth, requireRole("admin"), updatePurchaseDetails);
router.delete("/:id", requireAuth, requireRole("admin"), deletePurchase);

export default router;