import { Router } from "express";
import {
  getRentalCatalog,
  createRentalOrder,
  verifyRentalPayment,
  getUserRentals,
  requestBookReturn,
  getAllRentalsAdmin,
  confirmBookReturnAdmin,
  updateBookRentalSettingsAdmin,
  sendAdminRentalReminder,
} from "../controllers/rental.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Public route: Get books available for rent
router.get("/catalog", getRentalCatalog);

// Authenticated User routes
router.post("/create-order", requireAuth, createRentalOrder);
router.post("/verify-payment", requireAuth, verifyRentalPayment);
router.get("/my-rentals", requireAuth, getUserRentals);
router.post("/:rentalId/request-return", requireAuth, requestBookReturn);

// Admin routes
router.get("/admin/all", requireAuth, requireRole("admin"), getAllRentalsAdmin);
router.post("/admin/:rentalId/confirm-return", requireAuth, requireRole("admin"), confirmBookReturnAdmin);
router.post("/admin/:rentalId/send-reminder", requireAuth, requireRole("admin"), sendAdminRentalReminder);
router.put("/admin/book/:bookId/settings", requireAuth, requireRole("admin"), updateBookRentalSettingsAdmin);

export default router;
