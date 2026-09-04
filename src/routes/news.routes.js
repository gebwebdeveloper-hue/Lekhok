import { Router } from "express";
import {
  listNews,
  getNewsBySlug,
  getNewsOgHtml,
  createNews,
  updateNews,
  deleteNews,
  renameCategory,
  deleteCategory
} from "../controllers/news.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();
const newsUpload = upload.single("coverImage");

// Public endpoints
router.get("/", listNews);
router.get("/:slug/og", getNewsOgHtml);
router.get("/:slug", getNewsBySlug);

// Admin category management endpoints (MUST be defined before /:id)
router.put("/categories/rename", requireAuth, requireRole("admin"), renameCategory);
router.delete("/categories", requireAuth, requireRole("admin"), deleteCategory);

// Admin-only news CRUD endpoints
router.post("/", requireAuth, requireRole("admin"), newsUpload, createNews);
router.put("/:id", requireAuth, requireRole("admin"), newsUpload, updateNews);
router.delete("/:id", requireAuth, requireRole("admin"), deleteNews);

export default router;
