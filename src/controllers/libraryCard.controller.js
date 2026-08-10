import crypto from "crypto";
import Razorpay from "razorpay";
import { LibraryCard } from "../models/LibraryCard.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { generateLibraryCardPdf, buildLibraryCardPdfBuffer } from "../services/libraryCardPdf.service.js";
import { sendLibraryCardIssuedEmail } from "../services/mail.service.js";

// Helper to generate Card ID (e.g., LTC-783921)
function generateCardId() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `LTC-${randomNum}`;
}

// 1. Get logged-in user's library card
export const getMyLibraryCard = asyncHandler(async (req, res) => {
  const card = await LibraryCard.findOne({
    userId: req.user._id,
  }).sort({ createdAt: -1 });

  if (!card) {
    return res.json({
      success: true,
      hasCard: false,
      libraryCard: null,
    });
  }

  const isExpired = new Date(card.validUntil) < new Date();
  const isSuspended = card.status === "suspended";
  const isActive = card.status === "active" && !isExpired;

  res.json({
    success: true,
    hasCard: isActive,
    isSuspended,
    isExpired,
    status: card.status,
    libraryCard: card,
  });
});

// 2. Create Razorpay order for Library Card purchase (₹99 + 18% GST = ₹116.82)
export const createLibraryCardOrder = asyncHandler(async (req, res) => {
  const cardFee = 99;
  const gstAmount = Math.round(cardFee * 0.18 * 100) / 100; // ₹17.82
  const totalAmount = Math.round((cardFee + gstAmount) * 100) / 100; // ₹116.82
  const amountInPaise = Math.round(totalAmount * 100); // 11682 paise

  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;

  if (!keyId || !keySecret) {
    return res.json({
      success: true,
      directSubmission: true,
      amount: amountInPaise,
      pricing: { cardFee, gstAmount, totalAmount }
    });
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const options = {
    amount: amountInPaise,
    currency: "INR",
    receipt: `rcpt_lc_${Date.now()}`,
    notes: {
      userId: req.user._id.toString(),
      type: "library_card_purchase"
    }
  };

  const order = await razorpay.orders.create(options);

  res.json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency || "INR",
    keyId,
    pricing: {
      cardFee,
      gstAmount,
      totalAmount
    }
  });
});

// 3. Verify Razorpay Payment, Generate PDF & Issue Library Card
export const verifyLibraryCardPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    name,
    phone,
    dob,
    fatherName,
    state,
    district,
    villageTown,
    postOffice,
    pinCode,
    policeStation,
    emergencyContact,
    co,
    fullAddress,
  } = req.body;

  const keySecret = env.razorpayKeySecret;
  if (keySecret && razorpay_order_id && razorpay_payment_id && razorpay_signature) {
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      throw new ApiError(400, "Invalid Razorpay payment signature.");
    }
  }

  // Generate Unique Card ID
  let cardId = generateCardId();
  while (await LibraryCard.exists({ cardId })) {
    cardId = generateCardId();
  }

  const issuedAt = new Date();
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 99); // Lifetime validity

  const memberName = name || req.user.name || "Library Member";
  const memberPhone = phone || req.user.phone || "";
  const memberEmail = req.user.email;

  // Generate PDF
  const pdfResult = await generateLibraryCardPdf({
    cardId,
    userName: memberName,
    userEmail: memberEmail,
    userPhone: memberPhone,
    dob: dob || "",
    fatherName: fatherName || "",
    state: state || "Tripura",
    district: district || "",
    villageTown: villageTown || "",
    postOffice: postOffice || "",
    pinCode: pinCode || "",
    policeStation: policeStation || "",
    emergencyContact: emergencyContact || "",
    issuedAt,
    validUntil,
  });

  // Create Library Card Document
  const libraryCard = await LibraryCard.create({
    cardId,
    userId: req.user._id,
    userName: memberName,
    userEmail: memberEmail,
    userPhone: memberPhone,
    dob: dob || "",
    fatherName: fatherName || "",
    state: state || "Tripura",
    district: district || "",
    villageTown: villageTown || "",
    postOffice: postOffice || "",
    pinCode: pinCode || "",
    policeStation: policeStation || "",
    emergencyContact: emergencyContact || "",
    co: co || "",
    fullAddress: fullAddress || "",
    cardFee: 99,
    gstAmount: 17.82,
    totalAmount: 116.82,
    paymentId: razorpay_payment_id || `PAY_CARD_${Date.now()}`,
    orderId: razorpay_order_id || `ORD_CARD_${Date.now()}`,
    pdfUrl: pdfResult.url,
    issuedAt,
    validUntil,
    status: "active",
  });

  // Send Confirmation Email
  sendLibraryCardIssuedEmail(req.user, libraryCard).catch((err) =>
    console.error("[Email] Failed to send Library Card confirmation:", err)
  );

  res.status(201).json({
    success: true,
    message: "Library Card issued successfully!",
    libraryCard
  });
});

// 4. Admin API: List all issued library cards
export const getAllLibraryCardsAdmin = asyncHandler(async (req, res) => {
  const { q, status } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (q) {
    filter.$or = [
      { cardId: { $regex: q, $options: "i" } },
      { userName: { $regex: q, $options: "i" } },
      { userEmail: { $regex: q, $options: "i" } },
      { userPhone: { $regex: q, $options: "i" } }
    ];
  }

  const cards = await LibraryCard.find(filter).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: cards.length,
    libraryCards: cards
  });
});

// 5. Admin API: Revoke or update Library Card status
export const updateLibraryCardStatusAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active", "suspended", "expired"].includes(status)) {
    throw new ApiError(400, "Invalid status value. Must be 'active', 'suspended', or 'expired'.");
  }

  const card = await LibraryCard.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true }
  );

  if (!card) {
    throw new ApiError(404, "Library Card not found.");
  }

  res.json({
    success: true,
    message: `Library Card ${card.cardId} access has been updated to '${status}'.`,
    libraryCard: card,
  });
});

// 6. Download library card PDF — generated in-memory and streamed directly to client
export const downloadLibraryCardPdf = asyncHandler(async (req, res) => {
  const { cardId } = req.params;

  if (cardId && (cardId.toLowerCase() === "demo" || cardId.toLowerCase() === "sample")) {
    const pdfBuffer = await buildLibraryCardPdfBuffer({
      cardId: "LTC-DEMO01",
      userName: "Sample Reader (Demo)",
      userEmail: "lekhok.tripura@gmail.com",
      userPhone: "9876543210",
      dob: "2000-01-01",
      fatherName: "Sample Father",
      state: "Tripura",
      district: "West Tripura",
      villageTown: "Agartala",
      postOffice: "Agartala HO",
      pinCode: "799001",
      policeStation: "Agartala PS",
      emergencyContact: "9876543210",
      issuedAt: new Date(),
      validUntil: new Date(Date.now() + 99 * 365 * 24 * 60 * 60 * 1000),
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Demo_Library_Card.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  }

  const card = await LibraryCard.findOne({ cardId });
  if (!card) throw new ApiError(404, "Library card not found.");

  // Generate PDF buffer in-memory (no Cloudinary fetch — bypasses delivery restrictions)
  const pdfBuffer = await buildLibraryCardPdfBuffer({
    cardId:           card.cardId,
    userName:         card.userName,
    userEmail:        card.userEmail,
    userPhone:        card.userPhone,
    dob:              card.dob || "",
    fatherName:       card.fatherName || "",
    state:            card.state || "Tripura",
    district:         card.district || "",
    villageTown:      card.villageTown || "",
    postOffice:       card.postOffice || "",
    pinCode:          card.pinCode || "",
    policeStation:    card.policeStation || "",
    emergencyContact: card.emergencyContact || "",
    issuedAt:         card.issuedAt,
    validUntil:       card.validUntil,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="library-card-${cardId}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});
