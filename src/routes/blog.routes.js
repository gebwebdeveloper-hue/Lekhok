import { Router } from "express";
import {
  listBlogs,
  getBlogBySlug,
  createBlog,
  updateBlog,
  deleteBlog,
  renameCategory,
  deleteCategory
} from "../controllers/blog.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();
const blogUpload = upload.single("coverImage");

// Public endpoints
router.get("/", listBlogs);
router.get("/:slug", getBlogBySlug);

// Admin category management endpoints
router.put("/categories/rename", requireAuth, requireRole("admin"), renameCategory);
router.delete("/categories", requireAuth, requireRole("admin"), deleteCategory);

// Admin-only blog CRUD endpoints
router.post("/", requireAuth, requireRole("admin"), blogUpload, createBlog);
router.put("/:id", requireAuth, requireRole("admin"), blogUpload, updateBlog);
router.delete("/:id", requireAuth, requireRole("admin"), deleteBlog);

export default router;
