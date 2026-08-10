import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import purchaseRoutes from "./routes/purchase.routes.js";
import readerRoutes from "./routes/reader.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import clubRoutes from "./routes/club.routes.js";
import authorRoutes from "./routes/author.routes.js";
import publishingRoutes from "./routes/publishing.routes.js";
import newsletterRoutes from "./routes/newsletter.routes.js";
import enquiryRoutes from "./routes/enquiry.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import newsRoutes from "./routes/news.routes.js";
import rentalRoutes from "./routes/rental.routes.js";
import libraryCardRoutes from "./routes/libraryCard.routes.js";
import { LibraryCard } from "./models/LibraryCard.js";
import cafeMenuRoutes from "./cafe/routes/cafe.menu.routes.js";
import cafeOrderRoutes from "./cafe/routes/cafe.order.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", 1);
const allowedOrigins = (env.clientUrl || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "frame-ancestors": ["'self'", ...allowedOrigins],
      },
    },
    frameguard: false
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      
      const originNormalized = origin.replace(/\/$/, "");
      const isAllowed =
        allowedOrigins.includes(originNormalized) ||
        originNormalized === "http://localhost:5173" ||
        originNormalized.endsWith("lekhoktripura.in") ||
        originNormalized.endsWith("onrender.com");

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

// Redirect old local library-card PDF paths to Cloudinary URLs
app.get("/uploads/library-cards/:filename", async (req, res, next) => {
  try {
    const filename = req.params.filename; // e.g. library-card-LTC-211655.pdf
    const match = filename.match(/^library-card-(LTC-[\w]+)\.pdf$/);
    if (!match) return next();
    const cardId = match[1];
    const card = await LibraryCard.findOne({ cardId }).select("pdfUrl").lean();
    if (card && card.pdfUrl && /^https?:\/\//.test(card.pdfUrl)) {
      return res.redirect(301, card.pdfUrl);
    }
  } catch (_) { /* fall through to static */ }
  next();
});

app.use("/uploads", express.static(path.resolve(__dirname, "../uploads"), { fallthrough: false, maxAge: "1h" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, service: "LEKHAK API", status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/api/reader", readerRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/club", clubRoutes);
app.use("/api/authors", authorRoutes);
app.use("/api/enquiry", enquiryRoutes);
app.use("/api/publishing", publishingRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/rentals", rentalRoutes);
app.use("/api/library-card", libraryCardRoutes);
app.use("/api/cafe/menu", cafeMenuRoutes);
app.use("/api/cafe/orders", cafeOrderRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
