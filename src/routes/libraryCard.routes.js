import { Router } from "express";
import {
  getMyLibraryCard,
  createLibraryCardOrder,
  verifyLibraryCardPayment,
  getAllLibraryCardsAdmin,
  updateLibraryCardStatusAdmin
} from "../controllers/libraryCard.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/my-card", requireAuth, getMyLibraryCard);
router.post("/create-order", requireAuth, createLibraryCardOrder);
router.post("/verify-payment", requireAuth, verifyLibraryCardPayment);
router.get("/admin/all", requireAuth, requireRole("admin"), getAllLibraryCardsAdmin);
router.patch("/admin/update-status/:id", requireAuth, requireRole("admin"), updateLibraryCardStatusAdmin);

export default router;
