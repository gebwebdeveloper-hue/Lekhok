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

export const getPurchaseInvoice = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id)
    .populate("bookId")
    .populate("userId", "name email phone country district block pin postOffice nearbyLocation co");

  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  const isOwner = purchase.userId._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";
  if (!isOwner && !isAdmin) {
    throw new ApiError(403, "Access denied to this invoice.");
  }

  if (purchase.status !== "approved") {
    throw new ApiError(400, "Invoice is only available for approved purchases.");
  }

  const invoiceNo = `INV-${new Date(purchase.createdAt).toISOString().slice(0, 10).replace(/-/g, "")}-${purchase._id.toString().slice(-6).toUpperCase()}`;
  const invoiceDate = new Date(purchase.approvedAt || purchase.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });

  const book = purchase.bookId || {};
  const user = purchase.userId || {};
  const isPhysical = purchase.format === "paperback" || purchase.format === "hardcover";
  const address = purchase.deliveryAddress || {};

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice #${invoiceNo} - Lekhok Tripura</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #f4f6f8; color: #1a1a1a; padding: 40px 20px; }
    .invoice-card { max-width: 800px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #06b6d4; padding-bottom: 24px; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: 800; color: #0891b2; letter-spacing: 1px; text-transform: uppercase; }
    .logo span { color: #000; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 28px; color: #0f172a; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-title p { font-size: 13px; color: #64748b; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
    .box { background: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .box-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0891b2; letter-spacing: 1px; margin-bottom: 8px; }
    .box p { font-size: 13px; color: #334155; line-height: 1.6; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .table th { background: #0f172a; color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; padding: 12px 16px; text-align: left; }
    .table td { padding: 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #334155; }
    .table td.right { text-align: right; }
    .total-section { display: flex; justify-content: flex-end; margin-bottom: 30px; }
    .total-box { width: 280px; background: #ecfeff; border: 1px solid #a5f3fc; padding: 16px; border-radius: 8px; }
    .total-row { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #0e7490; }
    .status-badge { display: inline-block; padding: 6px 14px; background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 10px; }
    .footer { border-top: 1px solid #e2e8f0; pt: 20px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; margin-top: 40px; }
    .action-bar { max-width: 800px; margin: 0 auto 20px auto; display: flex; justify-content: flex-end; gap: 12px; }
    .btn { padding: 10px 20px; background: #0891b2; color: #fff; border: none; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .btn:hover { background: #0e7490; }
    @media print {
      body { background: #fff; padding: 0; }
      .action-bar { display: none; }
      .invoice-card { box-shadow: none; border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="action-bar">
    <button class="btn" id="print-btn">🖨️ Print / Download PDF</button>
  </div>

  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="logo">LEKHOK <span>TRIPURA</span></div>
        <p style="font-size: 12px; color: #64748b; margin-top: 6px;">Premium eBooks & Print Publications</p>
        <p style="font-size: 12px; color: #64748b;">Agartala, Tripura (W), India - 799001</p>
        <p style="font-size: 12px; color: #64748b;">Support: support@lekhoktripura.com</p>
      </div>
      <div class="invoice-title">
        <h1>TAX INVOICE</h1>
        <p><strong>Invoice No:</strong> ${invoiceNo}</p>
        <p><strong>Date:</strong> ${invoiceDate}</p>
        <div class="status-badge">✓ PAYMENT VERIFIED & APPROVED</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="box">
        <div class="box-title">Billed To (Customer)</div>
        <p><strong>${user.name || "Customer"}</strong></p>
        <p>Email: ${user.email || "N/A"}</p>
        <p>Phone: ${user.phone || "N/A"}</p>
      </div>

      <div class="box">
        <div class="box-title">${isPhysical ? "Shipping & Delivery Address" : "Order Information"}</div>
        ${isPhysical ? `
          <p>${address.co ? `C/O ${address.co}` : ""}</p>
          <p>${address.nearbyLocation ? `Landmark: ${address.nearbyLocation}` : ""}</p>
          <p>${address.block ? `Block: ${address.block}` : ""}, ${address.district || ""}</p>
          <p>${address.postOffice ? `PO: ${address.postOffice}` : ""} - PIN: ${address.pin || ""}</p>
          <p>${address.country || "India"}</p>
        ` : `
          <p>Format: <strong>DIGITAL E-BOOK (PDF)</strong></p>
          <p>Delivery: Instant Reader Access</p>
          <p>Access Status: <strong>UNLOCKED</strong></p>
        `}
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th>Format</th>
          <th>Qty</th>
          <th class="right">Amount (INR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${book.title || "Book"}</strong><br>
            <span style="font-size: 12px; color: #64748b;">Author: ${book.author || "Unknown"}</span>
          </td>
          <td><span style="text-transform: uppercase; font-weight: 700; font-size: 12px;">${purchase.format || "EBOOK"}</span></td>
          <td>1</td>
          <td class="right"><strong>₹${purchase.amount}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-box">
        <div class="total-row">
          <span>Total Paid:</span>
          <span>₹${purchase.amount}</span>
        </div>
        <p style="font-size: 11px; color: #0891b2; margin-top: 6px;">Transaction ID: ${purchase.transactionNumber || "UPI Verified"}</p>
      </div>
    </div>

    <div style="background: #fafafa; border: 1px dashed #cbd5e1; padding: 14px; border-radius: 8px; font-size: 12px; color: #475569; margin-bottom: 30px;">
      <p><strong>Payment Summary:</strong> Paid ₹${purchase.amount} via UPI Reference Code <code>${purchase.transactionNumber || "N/A"}</code>.</p>
    </div>

    <div class="footer">
      <p>Thank you for buying from <strong>Lekhok Tripura</strong>!</p>
      <p>This is an official Tax Invoice receipt for your order.</p>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      var btn = document.getElementById('print-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          window.print();
        });
      }
    });
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline';");
  res.send(html);
});


