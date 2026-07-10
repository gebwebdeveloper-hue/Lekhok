import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import { env } from "../config/env.js";

export const createPurchaseRequest = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.body.bookId);
  if (!book) throw new ApiError(404, "Book not found.");

  const approved = await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, status: "approved" });
  if (approved) throw new ApiError(409, "You already have access to this book.");

  const existingPending = await PurchaseRequest.findOne({ userId: req.user._id, bookId: book._id, status: "pending" });
  if (existingPending) return res.status(200).json({ success: true, purchase: existingPending, payment: { upiId: env.upiId, qr: env.upiQrImageUrl } });

  const screenshot = await persistUploadedFile(req.file, "payments", "image");
  const purchase = await PurchaseRequest.create({
    userId: req.user._id,
    bookId: book._id,
    amount: book.price,
    paymentScreenshot: screenshot,
    transactionNumber: req.body.transactionNumber,
    note: req.body.note
  });

  res.status(201).json({ success: true, purchase, payment: { upiId: env.upiId, qr: env.upiQrImageUrl } });
});

export const myPurchases = asyncHandler(async (req, res) => {
  const purchases = await PurchaseRequest.find({ userId: req.user._id }).populate("bookId").sort({ createdAt: -1 });
  res.json({ success: true, purchases });
});

export const adminPurchases = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const purchases = await PurchaseRequest.find(filter)
    .populate("userId", "name email role co phone country district block pin postOffice nearbyLocation")
    .populate("bookId")
    .sort({ createdAt: -1 });
  res.json({ success: true, purchases });
});

export const approvePurchase = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  purchase.status = "approved";
  purchase.approvedBy = req.user._id;
  purchase.approvedAt = new Date();
  purchase.rejectedBy = undefined;
  purchase.rejectedAt = undefined;
  purchase.adminNote = req.body.adminNote;
  await purchase.save();

  res.json({ success: true, purchase });
});

export const rejectPurchase = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  purchase.status = "rejected";
  purchase.rejectedBy = req.user._id;
  purchase.rejectedAt = new Date();
  purchase.approvedBy = undefined;
  purchase.approvedAt = undefined;
  purchase.adminNote = req.body.adminNote;
  await purchase.save();

  res.json({ success: true, purchase });
});