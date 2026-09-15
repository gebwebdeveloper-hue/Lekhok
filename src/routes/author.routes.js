import { Router } from "express";
import { listAuthors, listAllAuthors, createAuthor, updateAuthor, deleteAuthor, getAuthorProfile } from "../controllers/author.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();

// Specific routes first
router.get("/", listAuthors);
router.get("/all", requireAuth, requireRole("admin"), listAllAuthors);
router.get("/profile/:identifier", getAuthorProfile);

// Admin Mutation routes
router.post("/", requireAuth, requireRole("admin"), upload.single("thumbnail"), createAuthor);
router.put("/:id", requireAuth, requireRole("admin"), upload.single("thumbnail"), updateAuthor);
router.delete("/:id", requireAuth, requireRole("admin"), deleteAuthor);

// Dynamic parameter route LAST
router.get("/:identifier", getAuthorProfile);

export default router;

