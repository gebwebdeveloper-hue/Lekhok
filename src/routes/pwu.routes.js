import { Router } from "express";
import {
  submitPwuResponse,
  getAllPwuResponses,
  updatePwuResponse,
  deletePwuResponse,
  exportPwuResponsesCsv,
} from "../controllers/pwu.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

// Public submission route
router.post("/submit", submitPwuResponse);

// Admin-only management routes
router.get("/responses", requireAuth, requireRole("admin"), getAllPwuResponses);
router.get("/export", requireAuth, requireRole("admin"), exportPwuResponsesCsv);
router.patch("/responses/:id", requireAuth, requireRole("admin"), updatePwuResponse);
router.delete("/responses/:id", requireAuth, requireRole("admin"), deletePwuResponse);

export default router;
