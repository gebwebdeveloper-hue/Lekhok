import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { ApiError } from "../middlewares/error.middleware.js";

const execFileAsync = promisify(execFile);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function converterCommand() {
  return process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH || "soffice";
}

export async function convertDocxToPdfIfNeeded(file) {
  if (!file || file.mimetype !== DOCX_MIME) return file;

  const outputDir = path.dirname(file.path);
  const outputPath = path.join(outputDir, `${path.basename(file.path, path.extname(file.path))}.pdf`);

  try {
    await execFileAsync(converterCommand(), ["--headless", "--convert-to", "pdf", "--outdir", outputDir, file.path], { timeout: 60000 });
    await fs.access(outputPath);
    await fs.unlink(file.path).catch(() => {});
    return {
      ...file,
      path: outputPath,
      filename: path.basename(outputPath),
      originalname: file.originalname.replace(/\.docx$/i, ".pdf"),
      mimetype: "application/pdf"
    };
  } catch (_error) {
    throw new ApiError(500, "DOCX upload requires LibreOffice/soffice for PDF conversion. Install LibreOffice or set LIBREOFFICE_PATH/SOFFICE_PATH.");
  }
}