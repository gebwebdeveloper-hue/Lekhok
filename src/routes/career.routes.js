import { Router } from "express";
import {
  submitCareerApplication,
  getAllCareerResponses,
  updateCareerResponse,
  deleteCareerResponse,
  exportCareerResponsesCsv,
} from "../controllers/career.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Public submission route
router.post("/apply", submitCareerApplication);

// Admin-only management routes
router.get("/responses", requireAuth, requireRole("admin"), getAllCareerResponses);
router.get("/export", requireAuth, requireRole("admin"), exportCareerResponsesCsv);
router.patch("/responses/:id", requireAuth, requireRole("admin"), updateCareerResponse);
router.delete("/responses/:id", requireAuth, requireRole("admin"), deleteCareerResponse);

export default router;
