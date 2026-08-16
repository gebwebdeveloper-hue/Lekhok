import crypto from "crypto";
import Razorpay from "razorpay";
import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { NewsletterAccessRequest } from "../models/NewsletterAccessRequest.js";
import { PaymentConfig } from "../models/PaymentConfig.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import { sendPhysicalOrderEmail, sendPurchaseConfirmationEmail, sendRefundConfirmationEmail } from "../services/mail.service.js";
import { createShiprocketOrder, checkPincodeServiceability, getShiprocketOrderDetails, trackShiprocketByShipmentId, trackShiprocketShipment } from "../services/shiprocket.service.js";
import { env } from "../config/env.js";

// 18% GST applied on every book purchase
const GST_RATE = 0.18;
const applyGST = (basePrice) => Math.round(Number(basePrice) * (1 + GST_RATE) * 100) / 100;

// Delivery charge for paperback/hardcover based on state
const DELIVERY_CHARGES = {
  tripura: 80,
  "west bengal": 100,
  "westbengal": 100,
};
const DEFAULT_DELIVERY_CHARGE = 120;

/**
 * Dynamic Delivery Charge calculation:
 * Fetches live courier rate from Shiprocket API for the buyer's 6-digit Pincode (`pin`).
 * If Shiprocket returns courier rates, picks the minimum rate rounded up to nearest ₹.
 * Fallback to state estimate if pincode API is unavailable.
 */
const getDeliveryCharge = async (pin, state, weightKg = 0.4) => {
  if (pin && String(pin).trim().length === 6) {
    try {
      const shiprocketRes = await checkPincodeServiceability(String(pin).trim(), weightKg);
      const companies = shiprocketRes?.data?.available_courier_companies || [];
      if (companies.length > 0) {
        const rates = companies.map((c) => Number(c.rate)).filter((r) => !isNaN(r) && r > 0);
        if (rates.length > 0) {
          const minRate = Math.min(...rates);
          console.log(`[Shiprocket Dynamic Live Rate] Pin: ${pin}, Rate: ₹${minRate}`);
          return Math.ceil(minRate);
        }
      }
    } catch (err) {
      console.warn("[Delivery Charge] Live Shiprocket rate lookup failed, falling back to state rate:", err.message);
    }
  }

  // Fallback state estimation if pincode API unavailable
  if (!state) return DEFAULT_DELIVERY_CHARGE;
  const normalized = state.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "tripura") return DELIVERY_CHARGES.tripura;
  if (normalized === "west bengal" || normalized === "westbengal") return DELIVERY_CHARGES["west bengal"];
  return DEFAULT_DELIVERY_CHARGE;
};

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
  const rawBaseAmount = format === "paperback"
    ? (book.paperbackPrice || book.price)
    : format === "hardcover"
    ? (book.hardcoverPrice || book.price)
    : book.price;

  // Apply 5% club member discount on base price (before GST) if user is an active club member
  const isClubMember = !!(req.user.memberId && req.user.memberId.startsWith("LTCLUB-"));
  const clubDiscountRate = isClubMember ? 0.05 : 0;
  const baseAmount = isClubMember
    ? Math.round(rawBaseAmount * (1 - clubDiscountRate) * 100) / 100
    : rawBaseAmount;

  const deliveryCharge = !isEbook ? await getDeliveryCharge(req.body.pin, req.body.state) : 0;
  const amount = applyGST(baseAmount) + deliveryCharge;

  const purchase = await PurchaseRequest.create({
    userId: req.user._id,
    bookId: book._id,
    amount,
    paymentScreenshot: screenshot,
    format,
    transactionNumber: req.body.transactionNumber,
    note: req.body.note,
    deliveryCharge,
    deliveryAddress: isEbook ? undefined : {
      co: req.body.co,
      country: req.body.country || "India",
      state: req.body.state,
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
    isClubMember,
    clubDiscountApplied: isClubMember ? 5 : 0,
    payment: { upiId: env.upiId, qr: env.upiQrImageUrl }

  });
});

const syncShiprocketForPurchases = async (purchases) => {
  const pendingSync = purchases.filter(
    (p) => p.format !== "ebook" && p.shiprocketOrderId && p.shipmentStatus !== "delivered"
  );
  if (pendingSync.length === 0) return;

  await Promise.allSettled(
    pendingSync.map(async (purchase) => {
      try {
        const orderInfo = await getShiprocketOrderDetails(purchase.shiprocketOrderId);
        if (!orderInfo) return;

        const shipmentObj = orderInfo.shipments?.[0] || orderInfo.shipment || {};
        const courierName =
          orderInfo.courier_name ||
          shipmentObj.courier_name ||
          shipmentObj.courier ||
          purchase.courierService;

        const awbCode =
          orderInfo.awb_code ||
          shipmentObj.awb_code ||
          shipmentObj.awb ||
          purchase.trackingNumber;

        const rawStatus = (orderInfo.status || shipmentObj.status || "").toUpperCase();

        let changed = false;
        if (courierName && purchase.courierService !== courierName) {
          purchase.courierService = courierName;
          changed = true;
        }
        if (awbCode && purchase.trackingNumber !== awbCode) {
          purchase.trackingNumber = awbCode;
          changed = true;
        }
        if (rawStatus.includes("DELIVERED") && purchase.shipmentStatus !== "delivered") {
          purchase.shipmentStatus = "delivered";
          changed = true;
        } else if (
          (rawStatus.includes("TRANSIT") || rawStatus.includes("SHIPPED") || rawStatus.includes("OUT FOR DELIVERY")) &&
          purchase.shipmentStatus !== "shipped"
        ) {
          purchase.shipmentStatus = "shipped";
          changed = true;
        }

        if (orderInfo.etd) {
          purchase.estimatedDeliveryDate = new Date(orderInfo.etd);
          changed = true;
        }

        if (changed) {
          await purchase.save();
        }
      } catch (err) {
        // ignore background sync error
      }
    })
  );
};

export const myPurchases = asyncHandler(async (req, res) => {
  const purchases = await PurchaseRequest.find({ userId: req.user._id }).populate("bookId").sort({ createdAt: -1 });
  await syncShiprocketForPurchases(purchases);
  res.json({ success: true, purchases });
});

export const adminPurchases = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const purchases = await PurchaseRequest.find(filter)
    .populate("userId", "name email role phone age")
    .populate("bookId")
    .sort({ createdAt: -1 });
  await syncShiprocketForPurchases(purchases);
  res.json({ success: true, purchases });
});

export const handleShiprocketWebhook = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  console.log("[Shiprocket Webhook Payload Received]:", JSON.stringify(payload));

  const orderId = payload.order_id || payload.channel_order_id;
  const awbCode = payload.awb || payload.awb_code;
  const courierName = payload.courier_name;
  const currentStatus = (payload.current_status || payload.status || "").toUpperCase();

  if (!orderId && !awbCode) {
    return res.status(200).json({ success: true, message: "Webhook acknowledged (no order ID)" });
  }

  const query = orderId
    ? { $or: [{ shiprocketOrderId: orderId }, { transactionNumber: orderId }] }
    : { trackingNumber: awbCode };

  const purchase = await PurchaseRequest.findOne(query);
  if (purchase) {
    if (awbCode) purchase.trackingNumber = awbCode;
    if (courierName) purchase.courierService = courierName;

    if (currentStatus.includes("DELIVERED")) purchase.shipmentStatus = "delivered";
    else if (currentStatus.includes("TRANSIT") || currentStatus.includes("SHIPPED") || currentStatus.includes("OUT FOR DELIVERY")) purchase.shipmentStatus = "shipped";
    else if (currentStatus.includes("AWB") || currentStatus.includes("PICKUP") || currentStatus.includes("MANIFEST")) purchase.shipmentStatus = "processing";

    if (payload.etd) purchase.estimatedDeliveryDate = new Date(payload.etd);
    if (payload.current_location) purchase.currentLocation = payload.current_location;

    if (!purchase.shipmentHistory) purchase.shipmentHistory = [];
    purchase.shipmentHistory.push({
      status: purchase.shipmentStatus,
      location: payload.current_location || purchase.currentLocation || "In Transit",
      note: `Webhook auto-update from Shiprocket: ${currentStatus}`,
      timestamp: new Date()
    });

    await purchase.save();
    console.log(`[Shiprocket Webhook] Updated order ${purchase._id} with AWB: ${awbCode}, Status: ${purchase.shipmentStatus}`);
  }

  res.status(200).json({ success: true, message: "Webhook processed successfully" });
});

export const approvePurchase = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id).populate("bookId").populate("userId");
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  purchase.status = "approved";
  purchase.approvedBy = req.user._id;
  purchase.approvedAt = new Date();
  purchase.rejectedBy = undefined;
  purchase.rejectedAt = undefined;
  purchase.adminNote = req.body.adminNote;

  if (purchase.format !== "ebook") {
    purchase.shipmentStatus = "processing";
    try {
      const shiprocketRes = await createShiprocketOrder({
        purchase,
        book: purchase.bookId || {},
        user: purchase.userId || {}
      });
      if (shiprocketRes) {
        purchase.shiprocketOrderId = shiprocketRes.orderId;
        purchase.shiprocketShipmentId = shiprocketRes.shipmentId;
      }
    } catch (err) {
      console.error("[Shiprocket Error]: Failed to create order in Shiprocket:", err);
    }
  }

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

  const { transactionNumber, note, co, country, state, district, block, pin, postOffice, nearbyLocation } = req.body;
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

    const isClubMember = !!(req.user.memberId && req.user.memberId.startsWith("LTCLUB-"));
    const rawBaseAmount = format === "paperback"
      ? (book.paperbackPrice || book.price)
      : format === "hardcover"
      ? (book.hardcoverPrice || book.price)
      : book.price;
    const baseAmount = isClubMember
      ? Math.round(rawBaseAmount * 0.95 * 100) / 100
      : rawBaseAmount;
    const deliveryCharge = !isEbook ? getDeliveryCharge(state) : 0;
    const amount = applyGST(baseAmount) + deliveryCharge;

    const purchase = await PurchaseRequest.create({
      userId: req.user._id,
      bookId: book._id,
      amount,
      paymentScreenshot: screenshot,
      format,
      transactionNumber,
      note: note || `Cart purchase for ${book.title} (${format.toUpperCase()})`,
      deliveryCharge,
      deliveryAddress: isEbook ? undefined : {
        co,
        country: country || "India",
        state,
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

  // GST & delivery breakdown for invoice
  const gstRate = 0.18;
  const purchaseDeliveryCharge = purchase.deliveryCharge || 0;
  // amount stored = bookPriceWithGST + deliveryCharge
  const bookTotalWithGST = purchase.amount - purchaseDeliveryCharge;
  const baseAmountForInv = Math.round((bookTotalWithGST / (1 + gstRate)) * 100) / 100;
  const gstAmountForInv = Math.round((bookTotalWithGST - baseAmountForInv) * 100) / 100;

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
          <p>${address.state ? address.state + ", " : ""}${address.country || "India"}</p>
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
          <th class="right">Base Price (INR)</th>
          <th class="right">GST @18%</th>
          <th class="right">Total (INR)</th>
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
          <td class="right">₹${baseAmountForInv}</td>
          <td class="right">₹${gstAmountForInv}</td>
          <td class="right"><strong>₹${purchase.amount}</strong></td>
        </tr>
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-box" style="width: 320px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #334155; padding: 4px 0;">
          <span>Base Book Price:</span><span>₹${baseAmountForInv}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #334155; padding: 4px 0;">
          <span>GST (18%):</span><span>₹${gstAmountForInv}</span>
        </div>
        ${purchaseDeliveryCharge > 0 ? `
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #334155; padding: 4px 0;">
          <span>Delivery Charge:</span><span>₹${purchaseDeliveryCharge}</span>
        </div>` : ""}
        <div style="height: 1px; background: #a5f3fc; margin: 8px 0;"></div>
        <div class="total-row">
          <span>Total Paid:</span>
          <span>₹${purchase.amount}</span>
        </div>
        <p style="font-size: 11px; color: #0891b2; margin-top: 6px;">Transaction ID: ${purchase.transactionNumber || "UPI Verified"}</p>
      </div>
    </div>

    <div style="background: #fafafa; border: 1px dashed #cbd5e1; padding: 14px; border-radius: 8px; font-size: 12px; color: #475569; margin-bottom: 30px;">
      <p><strong>Payment Summary:</strong> Paid ₹${purchase.amount} (Book ₹${bookTotalWithGST} [Base ₹${baseAmountForInv} + GST @18% ₹${gstAmountForInv}]${purchaseDeliveryCharge > 0 ? ` + Delivery ₹${purchaseDeliveryCharge}` : ""}) via UPI Reference Code <code>${purchase.transactionNumber || "N/A"}</code>.</p>
      <p style="margin-top: 6px; color: #94a3b8;">GST Rate: 18% | SAC/HSN: 998431 (Digital Publishing Services)</p>
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

// ─── Razorpay Automated Order Creation ───────────────────────────────────────
export const createRazorpayOrder = asyncHandler(async (req, res) => {
  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;

  if (!keyId || !keySecret) {
    throw new ApiError(500, "Razorpay API keys are not configured on the server. Please check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
  }

  let items = req.body.items;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }

  // Support single item or cart array
  if (!items || !Array.isArray(items) || items.length === 0) {
    if (req.body.bookId) {
      items = [{
        bookId: req.body.bookId,
        format: req.body.format || "ebook"
      }];
    }
  }

  if (!items || items.length === 0) {
    throw new ApiError(400, "No valid book items provided for checkout.");
  }

  const { co, country, state, district, block, pin, postOffice, nearbyLocation, note } = req.body;
  let totalAmountINR = 0;
  const itemsToPurchase = [];

  // Compute delivery charge dynamically from live Shiprocket API for buyer PIN code
  const hasPhysical = items.some(i => (i.format || "ebook") !== "ebook");
  const cartDeliveryCharge = hasPhysical ? await getDeliveryCharge(pin, state) : 0;

  for (const item of items) {
    const book = await Book.findById(item.bookId);
    if (!book) continue;

    const format = item.format || "ebook";
    const isEbook = format === "ebook";

    // If ebook already purchased & approved, skip
    const approved = isEbook
      ? await PurchaseRequest.exists({ userId: req.user._id, bookId: book._id, format: "ebook", status: "approved" })
      : null;
    if (approved) continue;

    const isClubMember = !!(req.user.memberId && req.user.memberId.startsWith("LTCLUB-"));
    const rawItemBasePrice = format === "paperback"
      ? (book.paperbackPrice || book.price)
      : format === "hardcover"
      ? (book.hardcoverPrice || book.price)
      : book.price;
    const itemBasePrice = isClubMember
      ? Math.round(rawItemBasePrice * 0.95 * 100) / 100
      : rawItemBasePrice;
    const itemPrice = applyGST(itemBasePrice);

    totalAmountINR += itemPrice;
    itemsToPurchase.push({ book, format, price: itemPrice, isEbook });
  }

  // Add delivery charge once on top of item total (not per-item)
  totalAmountINR += cartDeliveryCharge;

  if (itemsToPurchase.length === 0) {
    throw new ApiError(400, "All items in cart have already been purchased and unlocked.");
  }

  const amountInPaise = Math.round(totalAmountINR * 100);
  const receipt = `order_${Date.now()}_${req.user._id.toString().slice(-4)}`;

  let razorpayOrder;
  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  try {
    razorpayOrder = await instance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        userId: req.user._id.toString(),
        userEmail: req.user.email
      }
    });
  } catch (err) {
    console.error("[Razorpay Order Error]:", err);
    throw new ApiError(500, err.message || "Failed to create Razorpay Order.");
  }

  const createdPurchases = [];
  for (const item of itemsToPurchase) {
    const isEbook = item.format === "ebook";
    // Delivery charge: spread across first physical item only (or store per-item)
    const itemDeliveryCharge = (!isEbook && cartDeliveryCharge > 0 &&
      createdPurchases.filter(p => p.format !== "ebook").length === 0)
      ? cartDeliveryCharge
      : 0;

    let purchase = await PurchaseRequest.findOne({
      userId: req.user._id,
      bookId: item.book._id,
      format: item.format,
      status: "pending"
    });

    if (purchase) {
      purchase.amount = item.price + itemDeliveryCharge;
      purchase.deliveryCharge = itemDeliveryCharge;
      purchase.paymentMethod = "razorpay";
      purchase.razorpayOrderId = razorpayOrder.id;
      purchase.note = note || `Automated Razorpay Checkout for ${item.book.title} (${item.format.toUpperCase()})`;
      if (!isEbook) {
        purchase.deliveryAddress = {
          co,
          country: country || "India",
          state,
          district,
          block,
          pin,
          postOffice,
          nearbyLocation
        };
      }
      await purchase.save();
    } else {
      purchase = await PurchaseRequest.create({
        userId: req.user._id,
        bookId: item.book._id,
        amount: item.price + itemDeliveryCharge,
        format: item.format,
        status: "pending",
        paymentMethod: "razorpay",
        razorpayOrderId: razorpayOrder.id,
        note: note || `Automated Razorpay Checkout for ${item.book.title} (${item.format.toUpperCase()})`,
        deliveryCharge: itemDeliveryCharge,
        deliveryAddress: isEbook ? undefined : {
          co,
          country: country || "India",
          state,
          district,
          block,
          pin,
          postOffice,
          nearbyLocation
        }
      });
    }
    createdPurchases.push(purchase);
  }

  res.status(201).json({
    success: true,
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency || "INR",
    keyId,
    purchaseIds: createdPurchases.map(p => p._id)
  });
});

// ─── Razorpay Payment HMAC Verification & Auto Access Granting ─────────────────
export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, "Missing Razorpay payment verification parameters.");
  }

  const keySecret = env.razorpayKeySecret;
  if (!keySecret) {
    throw new ApiError(500, "Razorpay Secret Key is missing on backend.");
  }

  // 1. Verify HMAC SHA-256 signature
  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;

  if (!isAuthentic) {
    throw new ApiError(400, "Invalid Razorpay payment signature. Payment verification failed.");
  }

  // 2. Find pending purchase requests associated with this Razorpay order ID
  const purchases = await PurchaseRequest.find({
    userId: req.user._id,
    razorpayOrderId: razorpay_order_id
  }).populate("bookId");

  if (!purchases || purchases.length === 0) {
    throw new ApiError(404, "No purchase requests found for this Razorpay order.");
  }

  // 3. Mark purchases as approved & grant instant access
  const updatedPurchases = [];
  for (const purchase of purchases) {
    purchase.status = "approved";
    purchase.razorpayPaymentId = razorpay_payment_id;
    purchase.razorpaySignature = razorpay_signature;
    purchase.transactionNumber = razorpay_payment_id;
    purchase.approvedAt = new Date();
    purchase.approvedBy = req.user._id;

    if (purchase.format !== "ebook") {
      purchase.shipmentStatus = "processing";
      try {
        await sendPhysicalOrderEmail({ purchase, book: purchase.bookId, user: req.user });
      } catch (err) {
        console.error("[Email Error]: Failed to notify admin for physical order:", err);
      }

      // Trigger automatic Shiprocket order creation
      try {
        const shiprocketRes = await createShiprocketOrder({
          purchase,
          book: purchase.bookId || {},
          user: req.user
        });
        if (shiprocketRes) {
          purchase.shiprocketOrderId = shiprocketRes.orderId;
          purchase.shiprocketShipmentId = shiprocketRes.shipmentId;
        }
      } catch (err) {
        console.error("[Shiprocket Error]: Failed to create order in Shiprocket:", err);
      }
    }

    await purchase.save();
    updatedPurchases.push(purchase);
  }

  // 4. Send email confirmation to the reader
  try {
    await sendPurchaseConfirmationEmail({
      user: req.user,
      purchases: updatedPurchases,
      paymentId: razorpay_payment_id
    });
  } catch (emailErr) {
    console.error("[Email Error] Failed to send purchase confirmation email to reader:", emailErr);
  }

  res.json({
    success: true,
    message: "Payment verified successfully! Access granted.",
    purchases: updatedPurchases
  });
});

export const deletePurchase = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findByIdAndDelete(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");
  res.json({ success: true, message: "Purchase transaction record deleted successfully." });
});

export const updatePurchaseDetails = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  const { amount, status, transactionNumber, razorpayPaymentId, note } = req.body;

  if (amount !== undefined) purchase.amount = Number(amount);
  if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) purchase.status = status;
  if (transactionNumber !== undefined) purchase.transactionNumber = transactionNumber;
  if (razorpayPaymentId !== undefined) purchase.razorpayPaymentId = razorpayPaymentId;
  if (note !== undefined) purchase.adminNote = note;

  await purchase.save();

  res.json({
    success: true,
    message: "Purchase details updated successfully.",
    purchase
  });
});

export const processRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { refundReason } = req.body;

  let purchase = await PurchaseRequest.findById(id).populate("userId").populate("bookId");

  if (!purchase) {
    // Check if it is a short story access request
    const storyAccess = await NewsletterAccessRequest.findById(id).populate("newsletterId");
    if (storyAccess) {
      const pId = storyAccess.razorpayPaymentId || storyAccess.transactionId;
      let razorpayRefund = null;

      if (storyAccess.razorpayPaymentId && env.razorpayKeyId && env.razorpayKeySecret) {
        try {
          const instance = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
          const amountInPaise = Math.round((storyAccess.amount || 0) * 100);
          razorpayRefund = await instance.payments.refund(storyAccess.razorpayPaymentId, {
            amount: amountInPaise,
            notes: { reason: refundReason || "Admin story refund", requestId: storyAccess._id.toString() }
          });
        } catch (err) {
          console.error("[Razorpay Story Refund Error]:", err);
        }
      }

      storyAccess.status = "rejected";
      storyAccess.adminNote = (storyAccess.adminNote ? storyAccess.adminNote + "\n" : "") + `[REFUNDED] ${refundReason || "Admin processed refund"}${razorpayRefund ? ` (Refund ID: ${razorpayRefund.id})` : ""}`;
      await storyAccess.save();

      try {
        if (storyAccess.userEmail) {
          await sendRefundConfirmationEmail({
            user: { name: storyAccess.userName, email: storyAccess.userEmail },
            itemTitle: storyAccess.newsletterId?.title || "Short Story Access",
            amount: storyAccess.amount || 0,
            paymentId: pId || "N/A",
            refundId: razorpayRefund?.id || "PROCESSED",
            reason: refundReason || "Admin issued story refund"
          });
        }
      } catch (emailErr) {
        console.error("[Email Error] Story refund email failed:", emailErr);
      }

      return res.json({
        success: true,
        message: `Refund of ₹${storyAccess.amount || 0} for "${storyAccess.newsletterId?.title || 'Story'}" processed successfully!`,
        purchase: storyAccess,
        refundId: razorpayRefund?.id
      });
    }

    throw new ApiError(404, "Purchase transaction not found.");
  }

  const paymentId = purchase.razorpayPaymentId || purchase.transactionNumber;
  let razorpayRefund = null;

  if (purchase.razorpayPaymentId && env.razorpayKeyId && env.razorpayKeySecret) {
    try {
      const instance = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
      const amountInPaise = Math.round(purchase.amount * 100);
      razorpayRefund = await instance.payments.refund(purchase.razorpayPaymentId, {
        amount: amountInPaise,
        notes: { reason: refundReason || "Admin initiated refund", purchaseId: purchase._id.toString() }
      });
    } catch (err) {
      console.error("[Razorpay Refund Error]:", err);
    }
  }

  purchase.status = "cancelled";
  purchase.adminNote = (purchase.adminNote ? purchase.adminNote + "\n" : "") + `[REFUNDED] ${refundReason || "Admin processed refund"}${razorpayRefund ? ` (Refund ID: ${razorpayRefund.id})` : ""}`;
  await purchase.save();

  try {
    if (purchase.userId?.email) {
      await sendRefundConfirmationEmail({
        user: purchase.userId,
        itemTitle: purchase.bookId?.title || "Book Purchase",
        amount: purchase.amount,
        paymentId: paymentId || "N/A",
        refundId: razorpayRefund?.id || "PROCESSED",
        reason: refundReason || "Admin initiated refund"
      });
    }
  } catch (emailErr) {
    console.error("[Email Error] Refund notification email failed:", emailErr);
  }

  res.json({
    success: true,
    message: `Refund of ₹${purchase.amount} processed successfully!`,
    purchase,
    refundId: razorpayRefund?.id
  });
});

export const checkDeliveryPincode = asyncHandler(async (req, res) => {
  const { pincode } = req.params;
  if (!pincode || pincode.length !== 6) {
    throw new ApiError(400, "Valid 6-digit Pincode is required.");
  }

  const result = await checkPincodeServiceability(pincode);
  if (!result || !result.data) {
    return res.json({
      success: true,
      serviceable: true,
      minRate: null,
      message: "Delivery available via Shiprocket / Speed Post."
    });
  }

  const companies = result.data.available_courier_companies || [];
  const serviceable = Boolean(
    result.data.courier_name || companies.length > 0
  );

  let minRate = null;
  if (companies.length > 0) {
    const rates = companies.map(c => Number(c.rate)).filter(r => !isNaN(r) && r > 0);
    if (rates.length > 0) {
      minRate = Math.round(Math.min(...rates) * 100) / 100;
    }
  }

  res.json({
    success: true,
    serviceable,
    minRate,
    couriers: companies.map(c => ({
      name: c.courier_name,
      rate: c.rate,
      etd: c.etd
    })),
    courierData: result.data
  });
});

export const syncPurchaseToShiprocket = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id).populate("bookId").populate("userId");
  if (!purchase) throw new ApiError(404, "Purchase request not found.");
  if (purchase.format === "ebook") throw new ApiError(400, "E-books do not require physical shipping.");

  const shiprocketRes = await createShiprocketOrder({
    purchase,
    book: purchase.bookId || {},
    user: purchase.userId || {}
  });

  if (!shiprocketRes) {
    throw new ApiError(500, "Failed to create order in Shiprocket. Please verify API User credentials and pickup location.");
  }

  purchase.shiprocketOrderId = shiprocketRes.orderId;
  purchase.shiprocketShipmentId = shiprocketRes.shipmentId;
  purchase.shipmentStatus = "processing";
  await purchase.save();

  res.json({
    success: true,
    message: "Order successfully synced to Shiprocket!",
    purchase,
    shiprocket: shiprocketRes
  });
});

export const autoSyncShiprocketTracking = asyncHandler(async (req, res) => {
  const purchase = await PurchaseRequest.findById(req.params.id);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  if (!purchase.shiprocketOrderId && !purchase.shiprocketShipmentId && !purchase.trackingNumber) {
    throw new ApiError(400, "This order does not have an active Shiprocket Order or AWB ID yet.");
  }

  let trackingInfo = null;
  let orderInfo = null;

  if (purchase.shiprocketOrderId) {
    orderInfo = await getShiprocketOrderDetails(purchase.shiprocketOrderId);
  }

  // Also try tracking by shipment ID or AWB if available
  const shipmentId = purchase.shiprocketShipmentId || orderInfo?.shipments?.[0]?.id || orderInfo?.shipment_id;
  if (purchase.trackingNumber) {
    trackingInfo = await trackShiprocketShipment(purchase.trackingNumber);
  } else if (shipmentId) {
    trackingInfo = await trackShiprocketByShipmentId(shipmentId);
  }

  const shipmentObj = orderInfo?.shipments?.[0] || orderInfo?.shipment || {};

  const courierName =
    orderInfo?.courier_name ||
    shipmentObj.courier_name ||
    shipmentObj.courier ||
    trackingInfo?.tracking_data?.courier_name ||
    purchase.courierService ||
    "Shiprocket Logistics";

  const awbCode =
    orderInfo?.awb_code ||
    shipmentObj.awb_code ||
    shipmentObj.awb ||
    trackingInfo?.tracking_data?.awb_code ||
    trackingInfo?.tracking_data?.shipment_track?.[0]?.awb_code ||
    purchase.trackingNumber ||
    "";

  const rawStatus = (
    orderInfo?.status ||
    shipmentObj.status ||
    trackingInfo?.tracking_data?.current_status ||
    ""
  ).toUpperCase();

  let mappedStatus = purchase.shipmentStatus || "processing";
  if (rawStatus.includes("DELIVERED")) mappedStatus = "delivered";
  else if (rawStatus.includes("TRANSIT") || rawStatus.includes("SHIPPED") || rawStatus.includes("OUT FOR DELIVERY")) mappedStatus = "shipped";
  else if (rawStatus.includes("AWB") || rawStatus.includes("PICKUP") || rawStatus.includes("MANIFEST") || rawStatus.includes("NEW") || rawStatus.includes("READY")) mappedStatus = "processing";

  const currentLocation = trackingInfo?.tracking_data?.scans?.[0]?.location || orderInfo?.pickup_location || purchase.currentLocation || "Warehouse";
  const estimatedDate = orderInfo?.etd || trackingInfo?.tracking_data?.etd || null;

  if (courierName) purchase.courierService = courierName;
  if (awbCode) purchase.trackingNumber = awbCode;
  if (mappedStatus) purchase.shipmentStatus = mappedStatus;
  if (currentLocation) purchase.currentLocation = currentLocation;
  if (estimatedDate) purchase.estimatedDeliveryDate = new Date(estimatedDate);

  if (!purchase.shipmentHistory) purchase.shipmentHistory = [];
  purchase.shipmentHistory.push({
    status: mappedStatus,
    location: currentLocation,
    note: `Auto-synced live from Shiprocket (Status: ${rawStatus || mappedStatus}, AWB: ${awbCode || 'N/A'})`,
    timestamp: new Date()
  });

  await purchase.save();

  res.json({
    success: true,
    message: awbCode
      ? `Shiprocket tracking auto-synced! AWB: ${awbCode} (${courierName})`
      : `Shiprocket tracking checked. Order status: ${mappedStatus}`,
    purchase,
    orderInfo,
    trackingInfo
  });
});





