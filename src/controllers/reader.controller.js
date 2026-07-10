import path from "path";
import { fileURLToPath } from "url";
import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { ReadingProgress } from "../models/ReadingProgress.js";
import { Bookmark } from "../models/Bookmark.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "../../");

export const getReaderAccess = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.bookId).select("+pdf title slug pages pdf");
  if (!book) throw new ApiError(404, "Book not found.");

  const approved = await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, status: "approved" });
  if (!approved && req.user.role !== "admin") throw new ApiError(403, "Purchase approval required to read this book.");
  if (!book.pdf?.url) throw new ApiError(404, "PDF file is not attached to this book.");

  const progress = await ReadingProgress.findOne({ userId: req.user._id, bookId: book._id });
  const bookmarks = await Bookmark.find({ userId: req.user._id, bookId: book._id }).sort({ page: 1 });

  res.json({
    success: true,
    book: { _id: book._id, title: book.title, slug: book.slug, pages: book.pages },
    pdf: { url: `/api/reader/${book._id}/stream` },
    progress,
    bookmarks
  });
});

export const streamReaderPdf = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.bookId).select("+pdf title pdf");
  if (!book) throw new ApiError(404, "Book not found.");

  const approved = await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, status: "approved" });
  if (!approved && req.user.role !== "admin") throw new ApiError(403, "Purchase approval required to read this book.");
  if (!book.pdf?.url) throw new ApiError(404, "PDF file is not attached to this book.");

  if (book.pdf.storage === "local") {
    const localPath = path.join(serverRoot, book.pdf.url.replace(/^\/?uploads\//, "uploads/"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${book.slug || "book"}.pdf"`);
    return res.sendFile(localPath);
  }

  res.json({ success: true, signedUrl: book.pdf.url, expiresInSeconds: 300 });
});

export const updateProgress = asyncHandler(async (req, res) => {
  const { currentPage, progress } = req.body;
  const record = await ReadingProgress.findOneAndUpdate(
    { userId: req.user._id, bookId: req.params.bookId },
    { currentPage, progress, lastReadAt: new Date() },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, progress: record });
});

export const addBookmark = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndUpdate(
    { userId: req.user._id, bookId: req.params.bookId, page: req.body.page },
    { label: req.body.label, note: req.body.note },
    { new: true, upsert: true, runValidators: true }
  );
  res.status(201).json({ success: true, bookmark });
});

export const deleteBookmark = asyncHandler(async (req, res) => {
  await Bookmark.deleteOne({ _id: req.params.bookmarkId, userId: req.user._id });
  res.json({ success: true, message: "Bookmark removed." });
});