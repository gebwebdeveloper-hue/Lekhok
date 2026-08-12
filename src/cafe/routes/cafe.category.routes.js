import { Router } from "express";
import { getCategories, upsertCategory } from "../controllers/category.controller.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";

const router = Router();

// Public — get all category headings
router.get("/", getCategories);

// Admin only — upsert a category heading config
router.put("/:categoryId", requireAuth, requireRole("admin"), upsertCategory);

export default router;
