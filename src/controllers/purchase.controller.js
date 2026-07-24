import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { PaymentConfig } from "../models/PaymentConfig.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import { sendPhysicalOrderEmail } from "../services/mail.service.js";
import { env } from "../config/env.js";

export const createPurchaseRequest = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.body.bookId);
  if (!book) throw new ApiError(404, "Book not found.");

  const format = req.body.format || "ebook";
  const isEbook = format === "ebook";

  const approved = isEbook
    ? await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, format: "ebook", status: "approved" })
    : null;
  if (approved) throw new ApiError(409, "You already have access to this book.");

  const existingPending = await PurchaseRequest.findOne({ userId: req.user._id, bookId: book._id, format, status: "pending" });
  if (existingPending) return res.status(200).json({ success: true, purchase: existingPending, payment: { upiId: env.upiId, qr: env.upiQrImageUrl } });

  const screenshot = await persistUploadedFile(req.file, "payments", "image");
  const amount = format === "paperback"
    ? (book.paperbackPrice || book.price)
    : format === "hardcover"
    ? (book.hardcoverPrice || book.price)
    : book.price;

  const purchase = await PurchaseRequest.create({
    userId: req.user._id,
    bookId: book._id,
    amount,
    paymentScreenshot: screenshot,
    format,
    transactionNumber: req.body.transactionNumber,
    note: req.body.note,
    deliveryAddress: isEbook ? undefined : {
      co: req.body.co,
      country: req.body.country || "India",
      district: req.body.district,
      block: req.body.block,
      pin: req.body.pin,
      postOffice: req.body.postOffice,
      nearbyLocation: req.body.nearbyLocation
    }
  });

  let adminEmailSent = false;
  if (!isEbook) {
    try {
      await sendPhysicalOrderEmail({ purchase, book, user: req.user });
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about physical order:", error);
    }
  }

  res.status(201).json({
    success: true,
    purchase,
    adminEmailSent,
    payment: { upiId: env.upiId, qr: env.upiQrImageUrl }
  });
});

export const myPurchases = asyncHandler(async (req, res) => {
  const purchases = await PurchaseRequest.find({ userId: req.user._id }).populate("bookId").sort({ createdAt: -1 });
  res.json({ success: true, purchases });
});

export const adminPurchases = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const purchases = await PurchaseRequest.find(filter)
    .populate("userId", "name email role phone age")
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

export const getPaymentConfig = asyncHandler(async (req, res) => {
  const config = await PaymentConfig.findOne({ key: "default" });
  if (config) {
    res.json({
      success: true,
      upiId: config.upiId,
      upiQrImageUrl: config.upiQrImage?.url || ""
    });
  } else {
    res.json({
      success: true,
      upiId: env.upiId,
      upiQrImageUrl: env.upiQrImageUrl
    });
  }
});

export const updatePaymentConfig = asyncHandler(async (req, res) => {
  const { upiId } = req.body;
  if (!upiId) throw new ApiError(400, "UPI ID is required.");

  let config = await PaymentConfig.findOne({ key: "default" });
  let qrImage = config?.upiQrImage;

  if (req.file) {
    qrImage = await persistUploadedFile(req.file, "payments", "image");
  }

  if (config) {
    config.upiId = upiId;
    if (qrImage) config.upiQrImage = qrImage;
    await config.save();
  } else {
    config = await PaymentConfig.create({
      key: "default",
      upiId,
      upiQrImage: qrImage
    });
  }

  res.json({
    success: true,
    message: "Payment configuration updated successfully.",
    config: {
      upiId: config.upiId,
      upiQrImageUrl: config.upiQrImage?.url || ""
    }
  });
});

export const createBatchPurchaseRequests = asyncHandler(async (req, res) => {
  let items = req.body.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "No valid items in cart to purchase.");
  }

  const { transactionNumber, note, co, country, district, block, pin, postOffice, nearbyLocation } = req.body;
  const screenshot = await persistUploadedFile(req.file, "payments", "image");
  const createdPurchases = [];

  for (const item of items) {
    const book = await Book.findById(item.bookId);
    if (!book) continue;

    const format = item.format || "ebook";
    const isEbook = format === "ebook";

    const approved = isEbook
      ? await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, format: "ebook", status: "approved" })
      : null;
    if (approved) continue;

    const amount = format === "paperback"
      ? (book.paperbackPrice || book.price)
      : format === "hardcover"
      ? (book.hardcoverPrice || book.price)
      : book.price;

    const purchase = await PurchaseRequest.create({
      userId: req.user._id,
      bookId: book._id,
      amount,
      paymentScreenshot: screenshot,
      format,
      transactionNumber,
      note: note || `Cart purchase for ${book.title} (${format.toUpperCase()})`,
      deliveryAddress: isEbook ? undefined : {
        co,
        country: country || "India",
        district,
        block,
        pin,
        postOffice,
        nearbyLocation
      }
    });

    if (!isEbook) {
      try {
        await sendPhysicalOrderEmail({ purchase, book, user: req.user });
      } catch (error) {
        console.error("[Email] Failed to notify admin about physical order:", error);
      }
    }

    createdPurchases.push(purchase);
  }

  res.status(201).json({
    success: true,
    purchases: createdPurchases,
    payment: { upiId: env.upiId, qr: env.upiQrImageUrl }
  });
});

export const updateShipmentStatus = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  const {
    shipmentStatus,
    courierService,
    trackingNumber,
    trackingUrl,
    currentLocation,
    estimatedDeliveryDate,
    note
  } = req.body;

  if (shipmentStatus) purchase.shipmentStatus = shipmentStatus;
  if (courierService !== undefined) purchase.courierService = courierService;
  if (trackingNumber !== undefined) purchase.trackingNumber = trackingNumber;
  if (trackingUrl !== undefined) purchase.trackingUrl = trackingUrl;
  if (currentLocation !== undefined) purchase.currentLocation = currentLocation;
  if (estimatedDeliveryDate !== undefined) {
    purchase.estimatedDeliveryDate = estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : null;
  }

  if (shipmentStatus === "shipped" && !purchase.shippedAt) {
    purchase.shippedAt = new Date();
  }
  if (shipmentStatus === "delivered" && !purchase.deliveredAt) {
    purchase.deliveredAt = new Date();
  }

  if (!purchase.shipmentHistory) purchase.shipmentHistory = [];
  purchase.shipmentHistory.push({
    status: shipmentStatus || purchase.shipmentStatus || "processing",
    location: currentLocation || purchase.currentLocation || "Warehouse",
    note: note || `Shipment status updated to ${shipmentStatus || purchase.shipmentStatus}`,
    timestamp: new Date()
  });

  await purchase.save();

  res.json({
    success: true,
    message: "Shipment status and tracking details updated successfully.",
    purchase
  });
});


