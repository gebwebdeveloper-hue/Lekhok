import { Router } from "express";
import {
  getPublicMembers,
  checkMembershipStatus,
  createClubOrder,
  verifyClubPayment,
  getAdminMembers,
  addAdminMember,
  updateAdminMember,
  deleteAdminMember,
  refundAdminMember,
} from "../controllers/club.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.get("/members", getPublicMembers);
router.get("/check-status", checkMembershipStatus);
router.post("/create-order", createClubOrder);
router.post("/verify-payment", verifyClubPayment);

// Admin-only routes
router.get("/admin/members", requireAuth, requireRole("admin"), getAdminMembers);
router.post("/admin/members", requireAuth, requireRole("admin"), addAdminMember);
router.put("/admin/members/:id", requireAuth, requireRole("admin"), updateAdminMember);
router.post("/admin/members/:id/refund", requireAuth, requireRole("admin"), refundAdminMember);
router.delete("/admin/members/:id", requireAuth, requireRole("admin"), deleteAdminMember);

export default router;
