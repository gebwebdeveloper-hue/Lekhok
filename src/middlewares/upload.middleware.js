import multer from "multer";
import path from "path";
import fs from "fs";
import { ApiError } from "./error.middleware.js";

const uploadRoot = path.resolve("uploads");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    let folder = "misc";
    if (file.fieldname === "cover") folder = "covers";
    if (file.fieldname === "previewImages") folder = "previews";
    if (["previewPdf", "pdf", "document"].includes(file.fieldname)) folder = "pdfs";
    if (file.fieldname === "paymentScreenshot") folder = "payments";
    const dir = path.join(uploadRoot, folder);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

const allowed = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

function fileFilter(_req, file, cb) {
  if (!allowed.has(file.mimetype)) return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}`));
  cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 80 * 1024 * 1024, files: 15 }
});

export const bookUpload = upload.fields([
  { name: "cover", maxCount: 1 },
  { name: "previewImages", maxCount: 8 },
  { name: "previewPdf", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
  { name: "document", maxCount: 1 }
]);

export const paymentUpload = upload.single("paymentScreenshot");