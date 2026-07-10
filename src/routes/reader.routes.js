import { Router } from "express";
import { addBookmark, deleteBookmark, getReaderAccess, streamReaderPdf, updateProgress } from "../controllers/reader.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { bookmarkDeleteSchema, bookmarkSchema, progressSchema, readerBookParamSchema } from "../utils/validators.js";

const router = Router();

router.get("/:bookId", requireAuth, validate(readerBookParamSchema), getReaderAccess);
router.get("/:bookId/stream", requireAuth, validate(readerBookParamSchema), streamReaderPdf);
router.patch("/:bookId/progress", requireAuth, validate(progressSchema), updateProgress);
router.post("/:bookId/bookmarks", requireAuth, validate(bookmarkSchema), addBookmark);
router.delete("/bookmarks/:bookmarkId", requireAuth, validate(bookmarkDeleteSchema), deleteBookmark);

export default router;