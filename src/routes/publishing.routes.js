import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { validate } from "../middlewares/validate.middleware.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { sendFreePublishingEmail, sendSelfPublishingPlanEmail } from "../services/mail.service.js";
import { freePublishingSchema, selfPublishingPlanSchema } from "../utils/validators.js";

const router = Router();
const uploadDir = path.resolve("uploads/publishing-manuscripts");
fs.mkdirSync(uploadDir, { recursive: true });

const manuscriptUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      cb(null, uploadDir);
    },
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      cb(null, `${Date.now()}-${safeBase}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const isPdf = file.mimetype === "application/pdf" && path.extname(file.originalname).toLowerCase() === ".pdf";
    if (!isPdf) return cb(new ApiError(400, "Only PDF manuscript files are allowed."));
    cb(null, true);
  }
}).single("manuscript");

function uploadManuscript(req, res, next) {
  manuscriptUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new ApiError(400, "Manuscript PDF must be below 5MB."));
    }
    return next(error);
  });
}

router.post("/free", uploadManuscript, validate(freePublishingSchema), async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "Please upload your manuscript as a PDF under 5MB.");

    let adminEmailSent = false;
    try {
      await sendFreePublishingEmail({ ...req.body, manuscript: req.file });
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about free publishing application:", error);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});


router.post("/plan", validate(selfPublishingPlanSchema), async (req, res, next) => {
  try {
    let adminEmailSent = false;
    try {
      await sendSelfPublishingPlanEmail(req.body);
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about self publishing plan inquiry:", error);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});
export default router;

