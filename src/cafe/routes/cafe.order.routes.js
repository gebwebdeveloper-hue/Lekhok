import { Router } from "express";
import {
  createRazorpayOrder,
  verifyPayment,
  getMyOrders,
  getLiveOrderStatus,
  getAdminOrders,
  updateOrderStatus,
  downloadOrderInvoicePdf,
} from "../controllers/order.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const router = Router();

// ── Customer Endpoints (Require Auth) ─────────────────────────────────────────
router.post("/create-razorpay-order", requireAuth, createRazorpayOrder);
router.post("/verify-payment", requireAuth, verifyPayment);
router.get("/my-orders", requireAuth, getMyOrders);
router.get("/live-status/:id", requireAuth, getLiveOrderStatus);
router.get("/:id/invoice-pdf", downloadOrderInvoicePdf);

// ── Admin Endpoints (Require Admin Role) ──────────────────────────────────────
router.get("/admin/all", requireAuth, requireRole("admin"), getAdminOrders);
router.patch("/admin/:id/status", requireAuth, requireRole("admin"), updateOrderStatus);

export default router;
