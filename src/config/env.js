import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverEnvPath = path.resolve(__dirname, "../../.env");

dotenv.config({ path: serverEnvPath });
dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);

if (missing.length && process.env.NODE_ENV === "production") {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/lekhak",
  jwtSecret: process.env.JWT_SECRET || "dev-only-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "lekhak_token",
  otpExpiresMinutes: Number(process.env.OTP_EXPIRES_MINUTES || 10),
  otpResendSeconds: Number(process.env.OTP_RESEND_SECONDS || 60),
  smtpConfigured,
  resendApiKey: process.env.RESEND_API_KEY || "",
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "LEKHAK <no-reply@lekhak.local>"
  },
  adminEmails: (process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean),
  upiId: process.env.UPI_ID || "",
  upiQrImageUrl: process.env.UPI_QR_IMAGE_URL || "",
  storageDriver: process.env.STORAGE_DRIVER || "local",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  }
};