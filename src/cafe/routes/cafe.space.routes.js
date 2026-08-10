import express from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import {
  getSpaceAvailability,
  createSpaceBookingOrder,
  verifySpaceBookingPayment,
  getMySpaceBookings,
  getAdminSpaceBookings,
  updateSpaceBookingStatus,
} from "../controllers/space.controller.js";

const router = express.Router();

// Public / Auth
router.get("/availability", getSpaceAvailability);
router.post("/create-booking-order", requireAuth, createSpaceBookingOrder);
router.post("/verify-booking-payment", requireAuth, verifySpaceBookingPayment);
router.get("/my-bookings", requireAuth, getMySpaceBookings);

// Admin routes
router.get("/admin/all", requireAuth, requireRole("admin"), getAdminSpaceBookings);
router.patch("/admin/:id/status", requireAuth, requireRole("admin"), updateSpaceBookingStatus);

export default router;
