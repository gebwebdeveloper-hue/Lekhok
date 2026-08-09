import crypto from "crypto";
import Razorpay from "razorpay";
import { Book } from "../models/Book.js";
import { BookRental } from "../models/BookRental.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { env } from "../config/env.js";
import { sendRentalConfirmationEmail, sendRentalOverdueReminderEmail } from "../services/mail.service.js";

// Utility helper to calculate overdue days & fines
export const calculateRentalFine = (dueDate, finePerDay = 5) => {
  const now = new Date();
  const due = new Date(dueDate);
  if (now <= due) return { isOverdue: false, daysOverdue: 0, totalFine: 0 };

  const diffTime = Math.abs(now - due);
  const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const totalFine = daysOverdue * finePerDay;
  return { isOverdue: true, daysOverdue, totalFine };
};

// GET /api/rentals/books — Public catalog of books available for rent
export const getRentalCatalog = asyncHandler(async (req, res) => {
  const books = await Book.find({ isRentalAvailable: true })
    .select("title slug author description cover price paperbackPrice hardcoverPrice category language rating isRentalAvailable rentalPrice rentalDurationDays finePerDay rentalStatus expectedReturnDate")
    .sort({ updatedAt: -1 });

  res.json({
    success: true,
    count: books.length,
    books,
  });
});

// POST /api/rentals/create-order — Create Razorpay order for book rental
export const createRentalOrder = asyncHandler(async (req, res) => {
  const { bookId, fullAddress } = req.body;
  if (!bookId) throw new ApiError(400, "Book ID is required.");

  const book = await Book.findById(bookId);
  if (!book) throw new ApiError(404, "Book not found.");
  if (!book.isRentalAvailable) throw new ApiError(400, "This book is not currently listed for rent.");
  if (book.rentalStatus !== "available") {
    throw new ApiError(400, "This book is currently on rent. Please check back later.");
  }

  const rentalFee = book.rentalPrice || 50;
  const gstAmount = Number((rentalFee * 0.18).toFixed(2));
  const totalAmount = Number((rentalFee + gstAmount).toFixed(2));

  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;

  if (!keyId || !keySecret) {
    // Fallback if Razorpay keys are missing
    return res.json({
      success: true,
      directSubmission: true,
      amount: Math.round(totalAmount * 100),
      rentalFee,
      gstAmount,
      totalAmount,
      bookId,
    });
  }

  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const amountInPaise = Math.round(totalAmount * 100);
  const receipt = `rent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const razorpayOrder = await instance.orders.create({
    amount: amountInPaise,
    currency: "INR",
    receipt,
    notes: {
      bookId: String(book._id),
      bookTitle: book.title,
      userId: String(req.user._id),
      userEmail: req.user.email,
      rentalFee: String(rentalFee),
      gstAmount: String(gstAmount),
      totalAmount: String(totalAmount),
    },
  });

  res.json({
    success: true,
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency || "INR",
    keyId,
    rentalFee,
    gstAmount,
    totalAmount,
    bookTitle: book.title,
  });
});

// POST /api/rentals/verify-payment — Verify Razorpay payment and initiate rental
export const verifyRentalPayment = asyncHandler(async (req, res) => {
  const {
    bookId,
    renterName,
    renterPhone,
    renterEmail,
    co,
    fullAddress,
    deliveryAddress,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  if (!bookId) throw new ApiError(400, "Book ID is required.");

  const book = await Book.findById(bookId);
  if (!book) throw new ApiError(404, "Book not found.");
  if (book.rentalStatus !== "available") {
    throw new ApiError(400, "This book is no longer available for rent.");
  }

  // Signature verification if Razorpay payment IDs are provided
  if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
    const keySecret = env.razorpayKeySecret;
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new ApiError(400, "Invalid payment signature verification.");
    }
  }

  const startDate = new Date();
  const durationDays = book.rentalDurationDays || 15;
  const dueDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const rentalFee = book.rentalPrice || 50;
  const gstAmount = Number((rentalFee * 0.18).toFixed(2));
  const totalAmount = Number((rentalFee + gstAmount).toFixed(2));

  // Create BookRental Document
  const rental = await BookRental.create({
    bookId: book._id,
    userId: req.user._id,
    renterName: renterName || req.user.name || "Reader",
    renterEmail: renterEmail || req.user.email,
    renterPhone: renterPhone || req.user.phone || "",
    co: co || "",
    deliveryAddress: fullAddress || deliveryAddress || "Self Pickup at Madhuban kathaltali, Tarader Thikana, Agartala, Tripura 799003",
    pickupAddress: "Madhuban kathaltali, Tarader Thikana, Agartala, Tripura 799003",
    rentalFee,
    gstAmount,
    totalAmount,
    finePerDay: book.finePerDay || 5,
    startDate,
    dueDate,
    status: "active",
    paymentId: req.body.transactionNumber || razorpay_payment_id || `PAY_DIRECT_${Date.now()}`,
    orderId: razorpay_order_id || `ORD_${Date.now()}`,
  });

  // Update Book status
  book.rentalStatus = "on_rent";
  book.currentRentalId = rental._id;
  book.expectedReturnDate = dueDate;
  await book.save();

  // Send confirmation email with payment receipt to user
  sendRentalConfirmationEmail({ rental, book, user: req.user }).catch((err) =>
    console.error("[Email] Error sending rental confirmation email:", err)
  );

  res.status(201).json({
    success: true,
    message: `🎉 Rental confirmed! Please self pickup at Madhuban kathaltali, Tarader Thikana, Agartala, Tripura 799003. Return Due: ${dueDate.toLocaleDateString("en-IN")}`,
    rental,
  });
});

// GET /api/rentals/my-rentals — User's rental dashboard
export const getUserRentals = asyncHandler(async (req, res) => {
  const rentals = await BookRental.find({ userId: req.user._id })
    .populate("bookId", "title cover author slug category")
    .sort({ createdAt: -1 });

  const formattedRentals = rentals.map((r) => {
    const obj = r.toObject();
    if (obj.status === "active" || obj.status === "return_requested") {
      const fineInfo = calculateRentalFine(obj.dueDate, obj.finePerDay);
      if (fineInfo.isOverdue && obj.status === "active") {
        obj.status = "overdue";
      }
      obj.daysOverdue = fineInfo.daysOverdue;
      obj.totalFine = fineInfo.totalFine;
    }
    return obj;
  });

  res.json({
    success: true,
    count: formattedRentals.length,
    rentals: formattedRentals,
  });
});

// POST /api/rentals/:rentalId/request-return — User requests book return
export const requestBookReturn = asyncHandler(async (req, res) => {
  const rental = await BookRental.findOne({ _id: req.params.rentalId, userId: req.user._id });
  if (!rental) throw new ApiError(404, "Rental record not found.");
  if (rental.status === "returned") throw new ApiError(400, "Book has already been returned.");

  rental.status = "return_requested";
  await rental.save();

  // Update book status
  const book = await Book.findById(rental.bookId);
  if (book) {
    book.rentalStatus = "return_requested";
    await book.save();
  }

  res.json({
    success: true,
    message: "Return request submitted! Our team will inspect the book upon physical receipt and confirm your return.",
    rental,
  });
});

// ADMIN: GET /api/rentals/admin/all — Fetch all rentals
export const getAllRentalsAdmin = asyncHandler(async (req, res) => {
  const rentals = await BookRental.find()
    .populate("bookId", "title cover author slug category")
    .populate("userId", "name email phone avatarUrl")
    .sort({ createdAt: -1 });

  const updatedRentals = rentals.map((r) => {
    const obj = r.toObject();
    if (obj.status === "active" || obj.status === "return_requested") {
      const fineInfo = calculateRentalFine(obj.dueDate, obj.finePerDay);
      if (fineInfo.isOverdue && obj.status === "active") {
        obj.status = "overdue";
      }
      obj.daysOverdue = fineInfo.daysOverdue;
      obj.calculatedFine = fineInfo.totalFine;
    }
    return obj;
  });

  res.json({
    success: true,
    count: updatedRentals.length,
    rentals: updatedRentals,
  });
});

// ADMIN: POST /api/rentals/admin/:rentalId/confirm-return — Admin confirms physical book return
export const confirmBookReturnAdmin = asyncHandler(async (req, res) => {
  const rental = await BookRental.findById(req.params.rentalId);
  if (!rental) throw new ApiError(404, "Rental record not found.");

  const now = new Date();
  const fineInfo = calculateRentalFine(rental.dueDate, rental.finePerDay);

  rental.status = "returned";
  rental.returnedAt = now;
  rental.totalFine = fineInfo.totalFine;
  if (req.body.adminNotes) {
    rental.adminNotes = req.body.adminNotes;
  }
  await rental.save();

  // Reset Book rentalStatus to "available"
  const book = await Book.findById(rental.bookId);
  if (book) {
    book.rentalStatus = "available";
    book.currentRentalId = null;
    book.expectedReturnDate = null;
    await book.save();
  }

  res.json({
    success: true,
    message: `Return confirmed for "${book?.title || "Book"}". Book is now AVAILABLE FOR RENT.`,
    rental,
  });
});

// ADMIN: PUT /api/rentals/admin/book/:bookId/settings — Update rental settings for a book
export const updateBookRentalSettingsAdmin = asyncHandler(async (req, res) => {
  const { isRentalAvailable, rentalPrice, rentalDurationDays, finePerDay, rentalStatus } = req.body;

  const book = await Book.findById(req.params.bookId);
  if (!book) throw new ApiError(404, "Book not found.");

  if (isRentalAvailable !== undefined) book.isRentalAvailable = Boolean(isRentalAvailable);
  if (rentalPrice !== undefined) book.rentalPrice = Number(rentalPrice);
  if (rentalDurationDays !== undefined) book.rentalDurationDays = Number(rentalDurationDays);
  if (finePerDay !== undefined) book.finePerDay = Number(finePerDay);
  if (rentalStatus && ["available", "on_rent", "return_requested"].includes(rentalStatus)) {
    book.rentalStatus = rentalStatus;
  }

  await book.save();

  res.json({
    success: true,
    message: `Rental settings updated for "${book.title}".`,
    book,
  });
});

// ADMIN: POST /api/rentals/admin/:rentalId/send-reminder — Send reminder email to renter
export const sendAdminRentalReminder = asyncHandler(async (req, res) => {
  const { rentalId } = req.params;
  const rental = await BookRental.findById(rentalId).populate("bookId");
  if (!rental) throw new ApiError(404, "Rental record not found.");

  const book = rental.bookId || {};
  const fineInfo = calculateRentalFine(rental.dueDate, rental.finePerDay || book.finePerDay || 5);

  const daysOverdue = fineInfo.daysOverdue > 0 ? fineInfo.daysOverdue : 1;
  const totalFine = fineInfo.totalFine > 0 ? fineInfo.totalFine : (rental.finePerDay || 5);

  await sendRentalOverdueReminderEmail({
    rental,
    book,
    daysOverdue,
    totalFine,
  });

  res.json({
    success: true,
    message: `🔔 Reminder email successfully sent to ${rental.renterEmail || "renter"}!`,
  });
});
