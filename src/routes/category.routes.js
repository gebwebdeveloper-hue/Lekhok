import { Router } from "express";
import { listCategories, createCategory, deleteCategory } from "../controllers/category.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { categoryCreateSchema, idParamSchema } from "../utils/validators.js";

const router = Router();

// Public route to list all categories
router.get("/", listCategories);

// Admin-only routes to create and delete categories
router.post("/", requireAuth, requireRole("admin"), validate(categoryCreateSchema), createCategory);
router.delete("/:id", requireAuth, requireRole("admin"), validate(idParamSchema), deleteCategory);

export default router;
