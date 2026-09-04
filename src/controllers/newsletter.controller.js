import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import slugify from "slugify";
import { Newsletter } from "../models/Newsletter.js";
import { NewsletterAccessRequest } from "../models/NewsletterAccessRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import {
  sendStoryAccessRequestEmail,
  sendStoryAccessApprovalEmail,
  sendNewStoryNotificationToSubscribers,
  sendRefundConfirmationEmail
} from "../services/mail.service.js";
import { env } from "../config/env.js";

function getFile(files, key) {
  return files?.[key]?.[0];
}

async function uniqueSlug(title, currentId = null) {
  let base = slugify(title, { lower: true, strict: true, trim: true });
  if (!base) {
    base = title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
  }
  if (!base) {
    base = `story-${Date.now()}`;
  }
  let slug = base;
  let index = 2;
  while (await Newsletter.exists({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${base}-${index++}`;
  }
  return slug;
}

function calculateReadingTime(htmlContent) {
  if (!htmlContent) return 0;
  // Strip HTML tags to get raw text
  const text = htmlContent.replace(/<[^>]*>/g, " ");
  // Count words
  const words = text.split(/\s+/).filter(Boolean).length;
  // Average reading speed is ~200 words per minute
  return Math.ceil(words / 200) || 1;
}

function parseCategories(categories) {
  if (!categories) return [];
  if (Array.isArray(categories)) return categories.map((c) => String(c).trim()).filter(Boolean);
  return String(categories).split(",").map((c) => c.trim()).filter(Boolean);
}

export const listNewsletters = asyncHandler(async (req, res) => {
  const { page = 1, limit, all = "false", categories } = req.query;
  
  const filter = {};
  // Only admin can see drafts, others see only published
  const isAdmin = req.user?.role === "admin";
  if (!isAdmin || all !== "true") {
    filter.status = "published";
    filter.publishedAt = { $lte: new Date() };
  }

  if (categories) {
    const categoryIds = categories.split(",").map((c) => c.trim()).filter(Boolean);
    if (categoryIds.length > 0) {
      filter.categories = { $in: categoryIds };
    }
  }

  const pageNumber = Math.max(Number(page), 1);
  const defaultLimit = all === "true" ? 1000 : 12;
  const requestedLimit = Number(limit || defaultLimit);
  const maxLimit = (all === "true" || isAdmin) ? 1000 : 100;
  const pageSize = Math.min(Math.max(requestedLimit, 1), maxLimit);

  const [newsletters, total] = await Promise.all([
    Newsletter.find(filter)
      .populate("categories")
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Newsletter.countDocuments(filter)
  ]);

  res.json({
    success: true,
    newsletters,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize)
    }
  });
});

export const getNewsletterBySlug = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findOne({ slug: req.params.slug }).populate("categories");
  if (!newsletter) throw new ApiError(404, "Story not found.");

  // Access check: only admin can view draft or future-published stories
  const isAdmin = req.user?.role === "admin";
  const isFuturePublished = newsletter.publishedAt && new Date(newsletter.publishedAt) > new Date();
  if (newsletter.status === "draft" || isFuturePublished) {
    if (!isAdmin) {
      throw new ApiError(403, "Access denied. This story is not yet published.");
    }
  }

  // Check if story is paid and requires access verification
  let isAccessGranted = !newsletter.isPaid || (newsletter.price || 0) === 0 || isAdmin;

  if (newsletter.isPaid && newsletter.price > 0 && !isAdmin) {
    const userEmail = req.query.email || req.headers["x-user-email"] || req.user?.email;
    const transactionId = req.query.transactionId || req.headers["x-transaction-id"];
    
    if (userEmail || transactionId) {
      const accessReq = await NewsletterAccessRequest.findOne({
        newsletterId: newsletter._id,
        status: "approved",
        $or: [
          ...(userEmail ? [{ userEmail: String(userEmail).toLowerCase().trim() }] : []),
          ...(transactionId ? [{ transactionId: String(transactionId).trim() }] : [])
        ]
      });
      if (accessReq) {
        isAccessGranted = true;
      }
    }
  }

  const result = newsletter.toObject();
  if (!isAccessGranted) {
    result.content = ""; // Withhold full text if unapproved
    result.isLocked = true;
  } else {
    result.isLocked = false;
  }

  res.json({ success: true, newsletter: result, isAccessGranted });
});

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOptimizedStoryCover(rawUrl, defaultLogo) {
  if (!rawUrl) {
    return { url: defaultLogo, width: 800, height: 600, type: "image/jpeg" };
  }
  let url = String(rawUrl).trim();
  if (!url.startsWith("http")) {
    const sUrl = (env.serverUrl || "").replace(/\/$/, "");
    url = `${sUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  // Cloudinary on-the-fly transformation:
  // Compress large story cover PNGs to ~80KB JPEGs for WhatsApp preview scrapers
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    url = url
      .replace("/image/upload/", "/image/upload/w_800,h_600,c_fill,q_75,f_jpg/")
      .replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, ".jpg");
    return { url, width: 800, height: 600, type: "image/jpeg" };
  }

  return { url, width: 800, height: 600, type: "image/jpeg" };
}

export const getNewsletterOgHtml = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(slug);
  const newsletter = await Newsletter.findOne(isObjectId ? { $or: [{ slug }, { _id: slug }] } : { slug });

  const clientUrl = (env.clientUrl || "https://www.lekhoktripura.in").replace(/\/$/, "");
  const defaultLogo = `${clientUrl}/Web.jpeg`;

  if (!newsletter) {
    return res.redirect(302, `${clientUrl}/short-stories`);
  }

  const storyUrl = `${clientUrl}/short-stories/${newsletter.slug || newsletter._id}`;
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isCrawler = /whatsapp|facebookexternalhit|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|applebot|googlebot|bingbot|pinterest/i.test(userAgent);

  // If a real human visits via standard browser, redirect immediately to the story page
  if (!isCrawler && !req.query.preview && !req.query.bot) {
    return res.redirect(302, storyUrl);
  }

  // Resolve cover URL to an optimized, lightweight JPEG (<100KB) for WhatsApp & social scrapers
  const coverData = getOptimizedStoryCover(newsletter.cover?.url, defaultLogo);

  const title = `${newsletter.title} — by ${newsletter.author || "Lekhok Tripura"} | Lekhok Tripura`;
  const rawDesc = newsletter.description || newsletter.excerpt || "";
  const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  const description = cleanDesc
    ? (cleanDesc.length > 200 ? cleanDesc.slice(0, 197) + "..." : cleanDesc)
    : `Read "${newsletter.title}" by ${newsletter.author || "Lekhok Tripura"} on Lekhok Tripura.`;

  const html = `<!doctype html>
<html lang="en" prefix="og: http://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  
  <!-- Primary Meta Tags -->
  <meta name="title" content="${escapeHtml(title)}" />
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(storyUrl)}" />
  <link rel="image_src" href="${escapeHtml(coverData.url)}" />
  
  <!-- Open Graph / WhatsApp / Facebook Preview Tags -->
  <meta property="og:site_name" content="Lekhok Tripura" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(storyUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(coverData.url)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(coverData.url)}" />
  <meta property="og:image:type" content="${escapeHtml(coverData.type)}" />
  <meta property="og:image:width" content="${coverData.width}" />
  <meta property="og:image:height" content="${coverData.height}" />
  <meta property="og:image:alt" content="${escapeHtml(newsletter.title)}" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${escapeHtml(storyUrl)}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(coverData.url)}" />

  <script>
    window.location.replace(${JSON.stringify(storyUrl)});
  </script>
</head>
<body style="background:#09090b;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;text-align:center;">
  <div style="max-width:420px;border:1px solid rgba(255,255,255,0.12);padding:28px;border-radius:20px;background:#18181b;">
    <img src="${escapeHtml(coverData.url)}" alt="${escapeHtml(newsletter.title)}" style="max-width:140px;border-radius:8px;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,0.5);" />
    <h2 style="margin:0 0 8px 0;font-size:20px;color:#ffffff;">${escapeHtml(newsletter.title)}</h2>
    <p style="margin:0 0 16px 0;color:rgba(255,255,255,0.6);font-size:14px;">by ${escapeHtml(newsletter.author || "Lekhok Tripura")}</p>
    <p style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:20px;">Opening story on Lekhok Tripura...</p>
    <a href="${escapeHtml(storyUrl)}" style="display:inline-block;background:#22d3ee;color:#000000;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">Read Story</a>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  return res.send(html);
});

export const createNewsletter = asyncHandler(async (req, res) => {
  const body = req.body;
  const coverFile = getFile(req.files, "cover");
  const cover = await persistUploadedFile(coverFile, "covers", "image");

  const readingTime = calculateReadingTime(body.content);
  const slug = body.slug || await uniqueSlug(body.title);
  const price = Math.max(Number(body.price || 0), 0);
  const isPaid = price > 0;

  const newsletter = await Newsletter.create({
    title: body.title,
    slug,
    description: body.description,
    content: body.content,
    cover,
    author: body.author || "Lekhok Tripura",
    status: body.status || "draft",
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
    readingTime,
    fontFamily: body.fontFamily || "Outfit",
    price,
    isPaid,
    categories: parseCategories(body.categories)
  });

  if (newsletter.status === "published") {
    sendNewStoryNotificationToSubscribers(newsletter).catch((err) =>
      console.error("[Email] Error notifying subscribers about new story:", err)
    );
  }

  res.status(201).json({ success: true, newsletter });
});

export const updateNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);
  if (!newsletter) throw new ApiError(404, "Story not found.");

  const body = req.body;
  const updates = { ...body };

  if (body.title && body.title !== newsletter.title) {
    updates.slug = body.slug || await uniqueSlug(body.title, newsletter._id);
  }

  if (body.content !== undefined) {
    updates.readingTime = calculateReadingTime(body.content);
  }

  if (body.publishedAt) {
    updates.publishedAt = new Date(body.publishedAt);
  }

  if (body.categories !== undefined) {
    updates.categories = parseCategories(body.categories);
  }

  if (body.price !== undefined) {
    const price = Math.max(Number(body.price || 0), 0);
    updates.price = price;
    updates.isPaid = price > 0;
  }

  const coverFile = getFile(req.files, "cover");
  const cover = await persistUploadedFile(coverFile, "covers", "image");
  if (cover) {
    updates.cover = cover;
  }

  const updated = await Newsletter.findByIdAndUpdate(newsletter._id, updates, {
    new: true,
    runValidators: true
  });

  const populated = await updated.populate("categories");

  res.json({ success: true, newsletter: populated });
});

export const deleteNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findByIdAndDelete(req.params.id);
  if (!newsletter) throw new ApiError(404, "Story not found.");
  res.json({ success: true, message: "Story deleted successfully." });
});

export const uploadInlineImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No image file uploaded.");

  const result = await persistUploadedFile(req.file, "newsletters", "image");
  if (!result) throw new ApiError(500, "Failed to upload image.");

  res.json({
    success: true,
    url: result.url
  });
});

export const submitAccessRequest = asyncHandler(async (req, res) => {
  const { newsletterId, userName, userEmail, userPhone, transactionId } = req.body;

  const newsletter = await Newsletter.findById(newsletterId);
  if (!newsletter) throw new ApiError(404, "Story not found.");
  if (!newsletter.isPaid || (newsletter.price || 0) === 0) {
    throw new ApiError(400, "This story is free and does not require payment verification.");
  }

  const existing = await NewsletterAccessRequest.findOne({
    newsletterId,
    $or: [{ transactionId: transactionId.trim() }, { userEmail: userEmail.toLowerCase().trim() }]
  });

  if (existing) {
    if (existing.status === "approved") {
      return res.json({ success: true, message: "Payment already approved!", request: existing });
    }
    existing.userName = userName;
    existing.userPhone = userPhone;
    existing.transactionId = transactionId;
    existing.status = "pending";
    await existing.save();
    sendStoryAccessRequestEmail({ request: existing, story: newsletter }).catch(console.error);
    return res.json({ success: true, message: "Payment request submitted for verification.", request: existing });
  }

  const accessRequest = await NewsletterAccessRequest.create({
    newsletterId,
    userName,
    userEmail: userEmail.toLowerCase().trim(),
    userPhone,
    transactionId,
    amount: newsletter.price,
    status: "pending"
  });

  sendStoryAccessRequestEmail({ request: accessRequest, story: newsletter }).catch(console.error);

  res.status(201).json({ success: true, message: "Payment request submitted for verification.", request: accessRequest });
});

export const checkAccessStatus = asyncHandler(async (req, res) => {
  const { newsletterId, userEmail, transactionId } = req.query;
  if (!newsletterId) throw new ApiError(400, "Newsletter ID is required.");

  const emailToCheck = userEmail || req.user?.email;

  if (!emailToCheck && !transactionId) {
    return res.json({ success: true, status: "none", approved: false });
  }

  const accessReq = await NewsletterAccessRequest.findOne({
    newsletterId,
    $or: [
      ...(emailToCheck ? [{ userEmail: String(emailToCheck).toLowerCase().trim() }] : []),
      ...(transactionId ? [{ transactionId: String(transactionId).trim() }] : [])
    ]
  }).sort({ createdAt: -1 });

  if (!accessReq) {
    return res.json({ success: true, status: "none", approved: false });
  }

  res.json({
    success: true,
    status: accessReq.status,
    approved: accessReq.status === "approved",
    request: accessReq
  });
});

export const listAccessRequests = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const requests = await NewsletterAccessRequest.find(filter)
    .populate("newsletterId", "title price slug author cover")
    .sort({ createdAt: -1 });

  res.json({ success: true, requests });
});

export const updateAccessRequestStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  if (!["approved", "rejected", "pending"].includes(status)) {
    throw new ApiError(400, "Invalid status.");
  }

  const accessReq = await NewsletterAccessRequest.findById(id).populate("newsletterId");
  if (!accessReq) throw new ApiError(404, "Access request not found.");

  accessReq.status = status;
  if (adminNote !== undefined) accessReq.adminNote = adminNote;

  if (status === "approved") {
    accessReq.approvedAt = new Date();
    accessReq.approvedBy = req.user?._id;
  } else if (status === "rejected") {
    accessReq.rejectedAt = new Date();
    accessReq.rejectedBy = req.user?._id;
  }

  await accessReq.save();

  if (accessReq.newsletterId) {
    sendStoryAccessApprovalEmail({ request: accessReq, story: accessReq.newsletterId }).catch(console.error);
  }

  res.json({ success: true, request: accessReq });
});

// 18% GST applied on story access fee
const GST_RATE = 0.18;
const applyGST = (basePrice) => Math.round(Number(basePrice) * (1 + GST_RATE) * 100) / 100;

// ─── Automated Story Razorpay Checkout ──────────────────────────────────────
export const createStoryRazorpayOrder = asyncHandler(async (req, res) => {
  const { newsletterId, userName, userEmail, userPhone } = req.body;

  const newsletter = await Newsletter.findById(newsletterId);
  if (!newsletter) throw new ApiError(404, "Story not found.");
  if (!newsletter.isPaid || (newsletter.price || 0) <= 0) {
    throw new ApiError(400, "This story is free.");
  }

  const keyId = env.razorpayKeyId;
  const keySecret = env.razorpayKeySecret;
  if (!keyId || !keySecret) {
    throw new ApiError(500, "Razorpay API keys are missing on the server.");
  }

  const finalAmountWithGST = applyGST(newsletter.price);
  const amountInPaise = Math.round(finalAmountWithGST * 100);
  const receipt = `story_${Date.now()}_${newsletterId.slice(-4)}`;

  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  let razorpayOrder;
  try {
    razorpayOrder = await instance.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        newsletterId: newsletter._id.toString(),
        storyTitle: newsletter.title,
        userEmail: userEmail.toLowerCase().trim()
      }
    });
  } catch (err) {
    console.error("[Razorpay Story Order Error]:", err);
    throw new ApiError(500, err.message || "Failed to create Razorpay Order for story.");
  }

  const formattedEmail = userEmail.toLowerCase().trim();
  let accessReq = await NewsletterAccessRequest.findOne({
    newsletterId,
    userEmail: formattedEmail,
    status: "pending"
  });

  if (accessReq) {
    accessReq.userName = userName;
    accessReq.userPhone = userPhone;
    accessReq.amount = finalAmountWithGST;
    accessReq.paymentMethod = "razorpay";
    accessReq.razorpayOrderId = razorpayOrder.id;
    await accessReq.save();
  } else {
    accessReq = await NewsletterAccessRequest.create({
      newsletterId,
      userName,
      userEmail: formattedEmail,
      userPhone,
      amount: finalAmountWithGST,
      status: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrder.id
    });
  }

  res.status(201).json({
    success: true,
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency || "INR",
    keyId,
    requestId: accessReq._id
  });
});

export const verifyStoryRazorpayPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ApiError(400, "Missing Razorpay payment verification parameters.");
  }

  const keySecret = env.razorpayKeySecret;
  if (!keySecret) {
    throw new ApiError(500, "Razorpay Secret Key is missing on backend.");
  }

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(body.toString())
    .digest("hex");

  const isAuthentic = expectedSignature === razorpay_signature;
  if (!isAuthentic) {
    throw new ApiError(400, "Invalid payment signature. Verification failed.");
  }

  const accessReq = await NewsletterAccessRequest.findOne({
    razorpayOrderId: razorpay_order_id
  }).populate("newsletterId");

  if (!accessReq) {
    throw new ApiError(404, "Story access request not found for this order.");
  }

  accessReq.status = "approved";
  accessReq.razorpayPaymentId = razorpay_payment_id;
  accessReq.razorpaySignature = razorpay_signature;
  accessReq.transactionId = razorpay_payment_id;
  accessReq.approvedAt = new Date();
  await accessReq.save();

  if (accessReq.newsletterId) {
    sendStoryAccessApprovalEmail({ request: accessReq, story: accessReq.newsletterId }).catch(console.error);
  }

  res.json({
    success: true,
    message: "Payment verified successfully! Story access granted.",
    request: accessReq
  });
});

export const deleteStoryAccessRequest = asyncHandler(async (req, res) => {
  const reqObj = await NewsletterAccessRequest.findByIdAndDelete(req.params.id);
  if (!reqObj) throw new ApiError(404, "Story access request not found.");
  res.json({ success: true, message: "Story access request deleted successfully." });
});

export const updateStoryAccessRequestDetails = asyncHandler(async (req, res) => {
  const reqObj = await NewsletterAccessRequest.findById(req.params.id);
  if (!reqObj) throw new ApiError(404, "Story access request not found.");

  const { amount, status, transactionId, razorpayPaymentId, adminNote } = req.body;

  if (amount !== undefined) reqObj.amount = Number(amount);
  if (status && ["pending", "approved", "rejected", "cancelled"].includes(status)) reqObj.status = status;
  if (transactionId !== undefined) reqObj.transactionId = transactionId;
  if (razorpayPaymentId !== undefined) reqObj.razorpayPaymentId = razorpayPaymentId;
  if (adminNote !== undefined) reqObj.adminNote = adminNote;

  await reqObj.save();

  res.json({
    success: true,
    message: "Story access request updated successfully.",
    request: reqObj
  });
});

export const refundStoryAccessRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { refundReason } = req.body;

  const accessReq = await NewsletterAccessRequest.findById(id).populate("newsletterId");
  if (!accessReq) throw new ApiError(404, "Story access request not found.");

  const pId = accessReq.razorpayPaymentId || accessReq.transactionId;
  let razorpayRefund = null;

  if (accessReq.razorpayPaymentId && env.razorpayKeyId && env.razorpayKeySecret) {
    try {
      const instance = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
      const amountInPaise = Math.round((accessReq.amount || 0) * 100);
      razorpayRefund = await instance.payments.refund(accessReq.razorpayPaymentId, {
        amount: amountInPaise,
        notes: { reason: refundReason || "Admin story refund", requestId: accessReq._id.toString() }
      });
    } catch (err) {
      console.error("[Razorpay Story Refund Error]:", err);
    }
  }

  accessReq.status = "rejected";
  accessReq.adminNote = (accessReq.adminNote ? accessReq.adminNote + "\n" : "") + `[REFUNDED] ${refundReason || "Admin processed refund"}${razorpayRefund ? ` (Refund ID: ${razorpayRefund.id})` : ""}`;
  await accessReq.save();

  try {
    if (accessReq.userEmail) {
      await sendRefundConfirmationEmail({
        user: { name: accessReq.userName, email: accessReq.userEmail },
        itemTitle: accessReq.newsletterId?.title || "Short Story Access",
        amount: accessReq.amount || 0,
        paymentId: pId || "N/A",
        refundId: razorpayRefund?.id || "PROCESSED",
        reason: refundReason || "Admin issued story refund"
      });
    }
  } catch (emailErr) {
    console.error("[Email Error] Story refund email failed:", emailErr);
  }

  res.json({
    success: true,
    message: `Refund of ₹${accessReq.amount || 0} for "${accessReq.newsletterId?.title || 'Story'}" processed successfully!`,
    request: accessReq,
    refundId: razorpayRefund?.id
  });
});



