import crypto from "crypto";
import Razorpay from "razorpay";
import ClubMember from "../models/ClubMember.js";
import { Author } from "../models/Author.js";
import { Book } from "../models/Book.js";
import { News } from "../models/News.js";
import { sendClubMemberConfirmationEmail, sendRefundConfirmationEmail } from "../services/mail.service.js";
import { buildClubCardPdfBuffer } from "../services/libraryCardPdf.service.js";
import { env } from "../config/env.js";

// Club Membership Price Constants: ₹999 + 18% GST = ₹1178.82
const CLUB_BASE_FEE = 999;
const GST_RATE = 0.18;
export const CLUB_TOTAL_FEE = Math.round(CLUB_BASE_FEE * (1 + GST_RATE) * 100) / 100; // 1178.82

// Public: Stream User's Real Official Club Membership Card PDF
export const downloadClubCardPdf = async (req, res, next) => {
  try {
    const rawMemberId = (req.query.memberId || "").trim();
    const rawEmail = (req.query.email || "").trim().toLowerCase();

    let member = null;

    // 1. Search by memberId if valid
    if (rawMemberId && rawMemberId !== "undefined" && rawMemberId !== "null" && rawMemberId !== "demo") {
      member = await ClubMember.findOne({
        memberId: { $regex: new RegExp(`^${rawMemberId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
      });
    }

    // 2. Search by email if not found yet
    if (!member && rawEmail && rawEmail !== "undefined" && rawEmail !== "null") {
      member = await ClubMember.findOne({
        email: { $regex: new RegExp(`^${rawEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
      });
    }

    // 3. Search by authenticated user email if available
    if (!member && req.user?.email) {
      member = await ClubMember.findOne({
        email: { $regex: new RegExp(`^${req.user.email.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
      });
    }

    // 4. Return 404 if no matching member found
    if (!member) {
      return res.status(404).json({
        success: false,
        message: "No active club membership found for this account or Member ID."
      });
    }

    const cardData = {
      memberId: member.memberId || "LTCLUB-MEMBER",
      fullName: member.fullName,
      email: member.email,
      role: member.role || "Lifetime Club Member",
    };

    const pdfBuffer = await buildClubCardPdfBuffer(cardData);
    const fileName = `Club_Membership_Card_${cardData.memberId}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// Public: Stream Demo Sample Club Membership Card PDF
export const downloadDemoClubCardPdf = async (req, res, next) => {
  try {
    const cardData = {
      memberId: "LTC-DEMO01",
      fullName: "Sample Member (Demo)",
      email: "lekhok.tripura@gmail.com",
      role: "Lifetime Club Member",
    };

    const pdfBuffer = await buildClubCardPdfBuffer(cardData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Demo_Club_Membership_Card.pdf"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// Generate unique Member ID in format LTCLUB-XXXX
const generateMemberId = async () => {
  let attempts = 0;
  while (attempts < 20) {
    const num = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
    const memberId = `LTCLUB-${num}`;
    const exists = await ClubMember.exists({ memberId });
    if (!exists) return memberId;
    attempts++;
  }
  // Fallback: use timestamp-based suffix
  return `LTCLUB-${Date.now().toString().slice(-4)}`;
};

// Public: Get aggregated live stats (Members, Writers, Events, Books)
export const getPublicStats = async (req, res, next) => {
  try {
    const [
      activeMembersCount,
      publicationAuthorsCount,
      publicationBooksCount,
      allBooksCount,
      newsCount
    ] = await Promise.all([
      ClubMember.countDocuments({ status: "active" }),
      Author.countDocuments({ ourPublicationAuthor: true }),
      Book.countDocuments({ ourPublication: true }),
      Book.countDocuments({}),
      News.countDocuments({})
    ]);

    let writersCount = publicationAuthorsCount;
    if (!writersCount) {
      const pubBooks = await Book.find({ ourPublication: true }, "author");
      const pubAuthors = new Set(pubBooks.map((b) => b.author?.trim().toLowerCase()).filter(Boolean));
      writersCount = pubAuthors.size;
    }

    const membersCount = activeMembersCount;
    const booksCount = publicationBooksCount > 0 ? publicationBooksCount : allBooksCount;
    const eventsCount = newsCount;

    res.status(200).json({
      success: true,
      stats: {
        members: membersCount,
        writers: writersCount,
        events: eventsCount,
        books: booksCount
      }
    });
  } catch (error) {
    next(error);
  }
};

// Public: Get all active club members
export const getPublicMembers = async (req, res, next) => {
  try {
    const members = await ClubMember.find({ status: "active" }).sort({ createdAt: 1 });
    res.status(200).json({ success: true, members });
  } catch (error) {
    next(error);
  }
};

// Public: Check if user is already an active paid member by email
export const checkMembershipStatus = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email query param required" });
    }

    const member = await ClubMember.findOne({
      email: email.trim().toLowerCase(),
      paymentStatus: "paid",
    });

    if (member) {
      return res.status(200).json({
        success: true,
        isMember: true,
        member: {
          fullName: member.fullName,
          email: member.email,
          phone: member.phone,
          role: member.role,
          paymentId: member.paymentId,
          createdAt: member.createdAt,
        },
      });
    }

    res.status(200).json({ success: true, isMember: false });
  } catch (error) {
    next(error);
  }
};

// Public: Create Razorpay Order for Club Membership (₹999 + 18% GST = ₹1178.82)
export const createClubOrder = async (req, res, next) => {
  try {
    const { fullName, email, phone } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({ success: false, message: "Full Name, Email, and Phone Number are required." });
    }

    // Check if user is already a paid member
    const existingMember = await ClubMember.findOne({
      email: email.trim().toLowerCase(),
      paymentStatus: "paid",
    });

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: "You are already a registered club member!",
        alreadyMember: true,
      });
    }

    const keyId = env.razorpayKeyId;
    const keySecret = env.razorpayKeySecret;

    if (!keyId || !keySecret) {
      // Fallback: If Razorpay keys not set on server, allow direct submission mode
      return res.status(200).json({
        success: true,
        directSubmission: true,
        amount: CLUB_TOTAL_FEE,
        message: "Razorpay keys not configured on server; proceeding with direct verification.",
      });
    }

    const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const amountInPaise = Math.round(CLUB_TOTAL_FEE * 100); // 117882 paise

    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `club_${Date.now()}`,
      notes: {
        fullName,
        email,
        phone,
        purpose: "Lekhok Tripura Club Membership (999 + 18% GST)",
      },
    };

    const order = await instance.orders.create(orderOptions);

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: CLUB_TOTAL_FEE,
      currency: "INR",
      keyId,
    });
  } catch (error) {
    next(error);
  }
};

// Public: Verify Razorpay Payment & Activate Membership
export const verifyClubPayment = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      phone,
      whatsapp,
      dateOfBirth,
      address,
      reason,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
    } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({ success: false, message: "Full Name, Email, and Phone Number are required." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify Razorpay signature if provided
    const keySecret = env.razorpayKeySecret;
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature && keySecret) {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Invalid payment signature verification." });
      }
    }

    const paymentId = razorpay_payment_id || `PAY_CLUB_${Date.now()}`;
    const orderId = razorpay_order_id || "";

    // Create or update member in database
    let member = await ClubMember.findOne({ email: cleanEmail });

    if (member) {
      member.fullName = fullName.trim();
      member.phone = phone.trim();
      member.whatsapp = (whatsapp || phone).trim();
      member.dateOfBirth = dateOfBirth || "";
      member.address = address || "";
      member.reason = reason || "";
      member.status = "active";
      member.paymentStatus = "paid";
      member.paymentId = paymentId;
      member.orderId = orderId;
      member.amountPaid = CLUB_TOTAL_FEE;
      // Assign memberId if this member doesn't have one yet
      if (!member.memberId) {
        member.memberId = await generateMemberId();
      }
      await member.save();
    } else {
      const newMemberId = await generateMemberId();
      member = await ClubMember.create({
        memberId: newMemberId,
        fullName: fullName.trim(),
        email: cleanEmail,
        phone: phone.trim(),
        whatsapp: (whatsapp || phone).trim(),
        dateOfBirth: dateOfBirth || "",
        address: address || "",
        reason: reason || "",
        role: "Member",
        status: "active",
        paymentStatus: "paid",
        paymentId,
        orderId,
        amountPaid: CLUB_TOTAL_FEE,
      });
    }

    // Send confirmation email to user
    try {
      await sendClubMemberConfirmationEmail({
        fullName: member.fullName,
        email: member.email,
        phone: member.phone,
        role: member.role,
        memberId: member.memberId,
        amountPaid: CLUB_TOTAL_FEE,
        paymentId,
        date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
      });
    } catch (mailErr) {
      console.error("[Mail] Failed to send user membership confirmation email:", mailErr);
    }

    // Send notification email to admin
    try {
      await sendClubApplicationEmail({
        fullName: member.fullName,
        email: member.email,
        phone: member.phone,
        whatsapp: member.whatsapp,
        dateOfBirth: member.dateOfBirth,
        address: member.address,
        reason: member.reason,
        amountPaid: CLUB_TOTAL_FEE,
        paymentId,
      });
    } catch (adminMailErr) {
      console.error("[Mail] Failed to notify admin about paid club membership:", adminMailErr);
    }

    res.status(200).json({
      success: true,
      message: "Club membership payment successful & activated!",
      member: {
        fullName: member.fullName,
        email: member.email,
        phone: member.phone,
        role: member.role,
        memberId: member.memberId,
        paymentId,
        amountPaid: CLUB_TOTAL_FEE,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Public: Verify a Member ID (for profile activation)
export const verifyMemberId = async (req, res, next) => {
  try {
    const { memberId, email } = req.body;
    if (!memberId || !email) {
      return res.status(400).json({ success: false, message: "Member ID and email are required." });
    }

    const member = await ClubMember.findOne({
      memberId: memberId.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
      paymentStatus: "paid",
      status: "active",
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        message: "Invalid Member ID or it does not match your registered email. Please check the confirmation email and try again.",
      });
    }

    return res.status(200).json({
      success: true,
      isMember: true,
      member: {
        memberId: member.memberId,
        fullName: member.fullName,
        email: member.email,
        role: member.role,
        createdAt: member.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Get all members & applications
export const getAdminMembers = async (req, res, next) => {
  try {
    const members = await ClubMember.find({}).sort({ createdAt: -1 });
    res.status(200).json({ success: true, members });
  } catch (error) {
    next(error);
  }
};

// Admin: Add a new member directly
export const addAdminMember = async (req, res, next) => {
  try {
    const { fullName, email, phone, whatsapp, role, status, address, dateOfBirth, actionText, reason, portfolioUrl } = req.body;

    if (!fullName || !email || !phone) {
      return res.status(400).json({ success: false, message: "Name, Mail ID, and Phone Number are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingMember = await ClubMember.findOne({ email: cleanEmail });
    if (existingMember) {
      return res.status(400).json({ success: false, message: "A club member with this Email ID already exists." });
    }

    const newMemberId = await generateMemberId();

    const newMember = await ClubMember.create({
      memberId: newMemberId,
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: phone.trim(),
      whatsapp: (whatsapp || phone).trim(),
      role: (role || "Member").trim(),
      status: status === "pending" ? "pending" : "active",
      paymentStatus: "paid",
      amountPaid: CLUB_TOTAL_FEE,
      address: (address || "").trim(),
      dateOfBirth: (dateOfBirth || "").trim(),
      actionText: (actionText || "").trim(),
      reason: (reason || "").trim(),
      portfolioUrl: (portfolioUrl || "").trim(),
    });

    res.status(201).json({
      success: true,
      message: "Club member added successfully.",
      member: newMember,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Update existing member details
export const updateAdminMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, whatsapp, role, status, paymentStatus, address, dateOfBirth, actionText, reason, portfolioUrl } = req.body;

    const member = await ClubMember.findById(id);
    if (!member) {
      return res.status(404).json({ success: false, message: "Club member not found." });
    }

    if (fullName) member.fullName = fullName.trim();
    if (email) member.email = email.trim().toLowerCase();
    if (phone) member.phone = phone.trim();
    if (whatsapp !== undefined) member.whatsapp = whatsapp.trim();
    if (role) member.role = role.trim();
    if (status) member.status = status;
    if (paymentStatus) member.paymentStatus = paymentStatus;
    if (address !== undefined) member.address = address.trim();
    if (dateOfBirth !== undefined) member.dateOfBirth = dateOfBirth.trim();
    if (actionText !== undefined) member.actionText = actionText.trim();
    if (reason !== undefined) member.reason = reason.trim();
    if (portfolioUrl !== undefined) member.portfolioUrl = portfolioUrl.trim();

    await member.save();

    res.status(200).json({
      success: true,
      message: "Club member updated successfully.",
      member,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Delete a member
export const deleteAdminMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const member = await ClubMember.findByIdAndDelete(id);

    if (!member) {
      return res.status(404).json({ success: false, message: "Club member not found." });
    }

    res.status(200).json({
      success: true,
      message: "Club member deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
};

// Admin: Refund Club Member
export const refundAdminMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { refundReason } = req.body;

    const member = await ClubMember.findById(id);
    if (!member) {
      return res.status(404).json({ success: false, message: "Club member not found." });
    }

    let razorpayRefund = null;
    const amountToRefund = member.amountPaid || 1178.82;

    if (member.paymentId && env.razorpayKeyId && env.razorpayKeySecret) {
      try {
        const instance = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
        const amountInPaise = Math.round(amountToRefund * 100);
        razorpayRefund = await instance.payments.refund(member.paymentId, {
          amount: amountInPaise,
          notes: { reason: refundReason || "Admin club refund", memberId: member._id.toString() }
        });
      } catch (err) {
        console.error("[Razorpay Club Refund Error]:", err);
      }
    }

    member.paymentStatus = "refunded";
    member.status = "cancelled";
    member.actionText = `Refunded ₹${amountToRefund}${razorpayRefund ? ` (Refund ID: ${razorpayRefund.id})` : ""}`;
    await member.save();

    try {
      if (member.email) {
        await sendRefundConfirmationEmail({
          user: { name: member.fullName, email: member.email },
          itemTitle: "Lekhok Tripura Readers & Writers Club Lifetime Membership",
          amount: amountToRefund,
          paymentId: member.paymentId || "N/A",
          refundId: razorpayRefund?.id || "PROCESSED",
          reason: refundReason || "Admin issued club refund"
        });
      }
    } catch (emailErr) {
      console.error("[Email Error] Club refund email failed:", emailErr);
    }

    res.status(200).json({
      success: true,
      message: `Refund of ₹${amountToRefund} for ${member.fullName} processed successfully!`,
      member,
      refundId: razorpayRefund?.id
    });
  } catch (error) {
    next(error);
  }
};
