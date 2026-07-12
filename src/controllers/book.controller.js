import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import https from "https";
import slugify from "slugify";
import { Book } from "../models/Book.js";
import { cloudinary } from "../config/cloudinary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "../../");
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import { convertDocxToPdfIfNeeded } from "../services/document.service.js";

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  return String(tags).split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

async function uniqueSlug(title, currentId = null) {
  const base = slugify(title, { lower: true, strict: true, trim: true });
  let slug = base;
  let index = 2;
  while (await Book.exists({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${base}-${index++}`;
  }
  return slug;
}

function getFile(files, key) {
  return files?.[key]?.[0];
}

async function resolvePdfUpload(files) {
  const uploadedPdf = getFile(files, "pdf");
  if (uploadedPdf) return uploadedPdf;
  return convertDocxToPdfIfNeeded(getFile(files, "document"));
}

export const listBooks = asyncHandler(async (req, res) => {
  const { category, featured, trending, ourPublication, q, author, page = 1, limit = 12 } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (featured !== undefined) filter.featured = featured === "true";
  if (trending !== undefined) filter.trending = trending === "true";
  if (ourPublication !== undefined) filter.ourPublication = ourPublication === "true";
  if (author) filter.author = { $regex: new RegExp(`^${author.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
  if (q) filter.$text = { $search: q };

  const pageNumber = Math.max(Number(page), 1);
  const pageSize = Math.min(Math.max(Number(limit), 1), 50);
  const [books, total] = await Promise.all([
    Book.find(filter).sort({ featured: -1, createdAt: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
    Book.countDocuments(filter)
  ]);

  res.json({ success: true, books, pagination: { page: pageNumber, limit: pageSize, total, pages: Math.ceil(total / pageSize) } });
});

export const getBookBySlug = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ slug: req.params.slug });
  if (!book) throw new ApiError(404, "Book not found.");

  let access = false;
  if (req.user) {
    access = Boolean(await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, format: "ebook", status: "approved" }));
  }

  res.json({ success: true, book, access });
});

export const createBook = asyncHandler(async (req, res) => {
  const body = req.body;
  const cover = await persistUploadedFile(getFile(req.files, "cover"), "covers", "image");
  const previewPdf = await persistUploadedFile(getFile(req.files, "previewPdf"), "previews", "raw");
  const pdf = await persistUploadedFile(await resolvePdfUpload(req.files), "pdfs", "raw");
  const previewImages = await Promise.all((req.files?.previewImages || []).map((file) => persistUploadedFile(file, "previews", "image")));

  const book = await Book.create({
    title: body.title,
    slug: body.slug || await uniqueSlug(body.title),
    author: body.author,
    description: body.description,
    price: Number(body.price),
    category: body.category,
    language: body.language || "English",
    pages: Number(body.pages),
    cover,
    previewImages,
    previewPdf,
    pdf,
    tags: parseTags(body.tags),
    featured: body.featured === "true" || body.featured === true,
    trending: body.trending === "true" || body.trending === true,
    ourPublication: body.ourPublication === "true" || body.ourPublication === true,
    comingSoon: body.comingSoon === "true" || body.comingSoon === true,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, book });
});

export const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw new ApiError(404, "Book not found.");

  const body = req.body;
  const updates = { ...body };
  if (body.title && body.title !== book.title) updates.slug = body.slug || await uniqueSlug(body.title, book._id);
  if (body.price !== undefined) updates.price = Number(body.price);
  if (body.pages !== undefined) updates.pages = Number(body.pages);
  if (body.tags !== undefined) updates.tags = parseTags(body.tags);
  if (body.featured !== undefined) updates.featured = body.featured === "true" || body.featured === true;
  if (body.trending !== undefined) updates.trending = body.trending === "true" || body.trending === true;
  if (body.ourPublication !== undefined) updates.ourPublication = body.ourPublication === "true" || body.ourPublication === true;
  if (body.comingSoon !== undefined) updates.comingSoon = body.comingSoon === "true" || body.comingSoon === true;

  const cover = await persistUploadedFile(getFile(req.files, "cover"), "covers", "image");
  const previewPdf = await persistUploadedFile(getFile(req.files, "previewPdf"), "previews", "raw");
  const pdf = await persistUploadedFile(await resolvePdfUpload(req.files), "pdfs", "raw");
  const previewImages = await Promise.all((req.files?.previewImages || []).map((file) => persistUploadedFile(file, "previews", "image")));

  if (cover) updates.cover = cover;
  if (previewPdf) updates.previewPdf = previewPdf;
  if (pdf) updates.pdf = pdf;
  if (previewImages.length) updates.previewImages = previewImages;

  const updated = await Book.findByIdAndUpdate(book._id, updates, { new: true, runValidators: true });
  res.json({ success: true, book: updated });
});

export const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) throw new ApiError(404, "Book not found.");
  res.json({ success: true, message: "Book deleted." });
});

export const streamBookPreview = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) throw new ApiError(404, "Book not found.");

  const approved = await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, format: "ebook", status: "approved" });
  if (!approved && req.user.role !== "admin") {
    throw new ApiError(403, "Access denied. Approved purchase is required to preview this book.");
  }

  let preview = book.previewPdf?.url || book.pdf?.url;
  if (!preview) throw new ApiError(404, "No preview available.");

  const targetFileObj = book.previewPdf?.url ? book.previewPdf : book.pdf;
  if (targetFileObj && targetFileObj.storage === "cloudinary" && targetFileObj.publicId) {
    const isRaw = targetFileObj.url.includes("/raw/upload/") || targetFileObj.url.includes("/raw/authenticated/");
    const isAuth = targetFileObj.url.includes("/authenticated/");
    
    if (isAuth) {
      const extMatch = targetFileObj.url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
      const format = extMatch ? extMatch[1] : "pdf";
      preview = cloudinary.utils.private_download_url(targetFileObj.publicId, format, {
        resource_type: isRaw ? "raw" : "image",
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 3600
      });
    } else {
      const versionMatch = targetFileObj.url.match(/\/v(\d+)\//);
      const version = versionMatch ? versionMatch[1] : null;
      const extMatch = targetFileObj.url.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
      const format = extMatch ? extMatch[1] : "pdf";
      const hasExtension = targetFileObj.publicId.endsWith(`.${format}`);
      
      preview = cloudinary.url(targetFileObj.publicId, {
        resource_type: isRaw ? "raw" : "image",
        sign_url: true,
        secure: true,
        ...(version ? { version } : {}),
        ...(!hasExtension ? { format } : {})
      });
    }
  }

  if (preview.startsWith("/uploads/")) {
    const localPath = path.join(serverRoot, preview.replace(/^\/?uploads\//, "uploads/"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="preview.pdf"`);
    return res.sendFile(localPath);
  }

  const downloadStream = (url, depth = 0) => {
    console.log(`[PDF Proxy] Fetching: ${url} (depth: ${depth})`);
    if (depth > 5) {
      console.error("[PDF Proxy] Error: Too many redirects.");
      return res.status(500).json({ success: false, message: "Too many redirects." });
    }

    const client = url.startsWith("https") ? https : http;
    client.get(url, (stream) => {
      // Follow HTTP redirects (301, 302, 307, 308)
      if (stream.statusCode >= 300 && stream.statusCode < 400 && stream.headers.location) {
        console.log(`[PDF Proxy] Redirecting to: ${stream.headers.location}`);
        return downloadStream(stream.headers.location, depth + 1);
      }

      if (stream.statusCode !== 200) {
        console.error(`[PDF Proxy] Error: Status ${stream.statusCode} received from storage provider.`);
        return res.status(500).json({ success: false, message: `Failed to fetch PDF from storage. Status: ${stream.statusCode}` });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="preview.pdf"`);
      stream.pipe(res);
    }).on("error", (err) => {
      console.error("[PDF Proxy] Connection error:", err);
      res.status(500).json({ success: false, message: `Failed to connect to storage: ${err.message}` });
    });
  };

  downloadStream(preview);
});
