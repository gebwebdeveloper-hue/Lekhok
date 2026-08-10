import { Router } from "express";
import {
  getPublicUpdates,
  getAdminUpdates,
  createUpdate,
  updateUpdate,
  deleteUpdate,
  getVisitorOfTheMonth,
  setVisitorSpotlight
} from "../controllers/update.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { upload } from "../../middlewares/upload.middleware.js";

const router = Router();

router.get("/", getPublicUpdates);
router.get("/visitor-of-month", getVisitorOfTheMonth);

// Admin Routes
router.get("/admin", requireAuth, requireRole("admin"), getAdminUpdates);
router.post("/", requireAuth, requireRole("admin"), upload.single("image"), createUpdate);
router.put("/:id", requireAuth, requireRole("admin"), upload.single("image"), updateUpdate);
router.delete("/:id", requireAuth, requireRole("admin"), deleteUpdate);
router.post("/visitor-of-month", requireAuth, requireRole("admin"), setVisitorSpotlight);

export default router;
