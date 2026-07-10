import { Router } from "express";
import { createBook, deleteBook, getBookBySlug, listBooks, updateBook, streamBookPreview } from "../controllers/book.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { bookUpload } from "../middlewares/upload.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { bookCreateSchema, bookUpdateSchema, idParamSchema } from "../utils/validators.js";

const router = Router();

router.get("/", listBooks);
router.get("/:id/preview-stream", requireAuth, validate(idParamSchema), streamBookPreview);
router.get("/:slug", getBookBySlug);
router.post("/", requireAuth, requireRole("admin"), bookUpload, validate(bookCreateSchema), createBook);
router.put("/:id", requireAuth, requireRole("admin"), bookUpload, validate(bookUpdateSchema), updateBook);
router.delete("/:id", requireAuth, requireRole("admin"), validate(idParamSchema), deleteBook);

export default router;