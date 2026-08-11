import express from "express";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import {
  getSpaceAvailability,
  createSpaceBookingOrder,
  verifySpaceBookingPayment,
  getMySpaceBookings,
  getAdminSpaceBookings,
  updateSpaceBookingStatus,
  getAdminTables,
  createTable,
  updateTableStatus,
  deleteTable,
} from "../controllers/space.controller.js";

const router = express.Router();

// Public / Auth
router.get("/availability", getSpaceAvailability);
router.post("/create-booking-order", requireAuth, createSpaceBookingOrder);
router.post("/verify-booking-payment", requireAuth, verifySpaceBookingPayment);
router.get("/my-bookings", requireAuth, getMySpaceBookings);

// Admin routes - Space Pre-bookings
router.get("/admin/all", requireAuth, requireRole("admin"), getAdminSpaceBookings);
router.patch("/admin/:id/status", requireAuth, requireRole("admin"), updateSpaceBookingStatus);

// Admin routes - Cafe Tables & Seating Management
router.get("/admin/tables", requireAuth, requireRole("admin"), getAdminTables);
router.post("/admin/tables", requireAuth, requireRole("admin"), createTable);
router.patch("/admin/tables/:id/status", requireAuth, requireRole("admin"), updateTableStatus);
router.delete("/admin/tables/:id", requireAuth, requireRole("admin"), deleteTable);

export default router;
