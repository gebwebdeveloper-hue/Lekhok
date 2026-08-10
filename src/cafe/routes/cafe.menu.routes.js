import { Router } from "express";
import {
  getMenu,
  getFeaturedMenu,
  getAllMenuItems,
  uploadMenuImage,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/menu.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { cafeImageUpload } from "../../middlewares/upload.middleware.js";

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/", getMenu);
router.get("/featured", getFeaturedMenu);

// ── Admin only ────────────────────────────────────────────────────────────────
router.get("/all", requireAuth, requireRole("admin"), getAllMenuItems);
router.post("/upload-image", requireAuth, requireRole("admin"), cafeImageUpload, uploadMenuImage);
router.post("/", requireAuth, requireRole("admin"), createMenuItem);
router.patch("/:id", requireAuth, requireRole("admin"), updateMenuItem);
router.delete("/:id", requireAuth, requireRole("admin"), deleteMenuItem);

export default router;
