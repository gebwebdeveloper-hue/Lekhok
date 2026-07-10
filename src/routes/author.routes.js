import { Router } from "express";
import { listAuthors, listAllAuthors, createAuthor, updateAuthor, deleteAuthor } from "../controllers/author.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();

// Public
router.get("/", listAuthors);

// Admin
router.get("/all", requireAuth, requireRole("admin"), listAllAuthors);
router.post("/", requireAuth, requireRole("admin"), upload.single("thumbnail"), createAuthor);
router.put("/:id", requireAuth, requireRole("admin"), upload.single("thumbnail"), updateAuthor);
router.delete("/:id", requireAuth, requireRole("admin"), deleteAuthor);

export default router;
