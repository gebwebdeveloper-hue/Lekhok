import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { cloudinary } from "../config/cloudinary.js";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "../../");

export function localUrlFor(file) {
  const relative = path.relative(path.join(serverRoot, "uploads"), file.path).replaceAll("\\", "/");
  return `/uploads/${relative}`;
}

export async function persistUploadedFile(file, folder = "misc", resourceType = "auto") {
  if (!file) return undefined;

  if (env.storageDriver === "cloudinary" && env.cloudinary.cloudName) {
    const isPrivate = folder === "pdfs" || (folder === "previews" && resourceType === "raw");
    const result = await cloudinary.uploader.upload(file.path, {
      folder: `lekhak/${folder}`,
      resource_type: resourceType,
      ...(isPrivate ? { type: "authenticated" } : {})
    });
    await fs.unlink(file.path).catch(() => {});
    return {
      url: result.secure_url,
      publicId: result.public_id,
      storage: "cloudinary",
      mimeType: file.mimetype,
      size: file.size,
      originalName: file.originalname
    };
  }

  return {
    url: localUrlFor(file),
    storage: "local",
    mimeType: file.mimetype,
    size: file.size,
    originalName: file.originalname
  };
}