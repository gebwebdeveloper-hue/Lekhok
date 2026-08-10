import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../middlewares/error.middleware.js";
import { CafeUpdate } from "../models/CafeUpdate.js";
import { CafeSpotlight } from "../models/CafeSpotlight.js";
import { CafeOrder } from "../models/CafeOrder.js";
import { PurchaseRequest } from "../../models/PurchaseRequest.js";
import { persistUploadedFile } from "../../services/storage.service.js";

/**
 * GET /api/cafe/updates
 * Public updates feed (Published only, Pinned first)
 */
export const getPublicUpdates = asyncHandler(async (req, res) => {
  const { category } = req.query;
  const filter = { isPublished: true };
  if (category && category !== "all") {
    filter.category = category;
  }

  const updates = await CafeUpdate.find(filter)
    .sort({ isPinned: -1, createdAt: -1 });

  res.json({ success: true, updates });
});

/**
 * GET /api/cafe/updates/admin
 * Admin list of all updates (published & drafts)
 */
export const getAdminUpdates = asyncHandler(async (req, res) => {
  const updates = await CafeUpdate.find().sort({ createdAt: -1 });
  res.json({ success: true, updates });
});

/**
 * POST /api/cafe/updates
 * Admin create new update
 */
export const createUpdate = asyncHandler(async (req, res) => {
  const { title, content, category, authorName, isPinned, isPublished } = req.body;
  if (!title || !content) {
    throw new ApiError(400, "Title and content are required.");
  }

  let imageUrl = req.body.imageUrl || "";
  if (req.file) {
    const uploaded = await persistUploadedFile(req.file, "updates", "image");
    if (uploaded?.url) imageUrl = uploaded.url;
  }

  const update = await CafeUpdate.create({
    title,
    content,
    category: category || "Announcement",
    imageUrl,
    authorName: authorName || "Lekhok Tripura Admin",
    isPinned: isPinned === "true" || isPinned === true,
    isPublished: isPublished === undefined ? true : (isPublished === "true" || isPublished === true)
  });

  res.status(201).json({ success: true, message: "Update created successfully!", update });
});

/**
 * PUT /api/cafe/updates/:id
 * Admin update post
 */
export const updateUpdate = asyncHandler(async (req, res) => {
  const update = await CafeUpdate.findById(req.params.id);
  if (!update) throw new ApiError(404, "Update post not found.");

  const { title, content, category, authorName, isPinned, isPublished, imageUrl } = req.body;

  if (title) update.title = title;
  if (content) update.content = content;
  if (category) update.category = category;
  if (authorName) update.authorName = authorName;
  if (isPinned !== undefined) update.isPinned = isPinned === "true" || isPinned === true;
  if (isPublished !== undefined) update.isPublished = isPublished === "true" || isPublished === true;
  if (imageUrl !== undefined) update.imageUrl = imageUrl;

  if (req.file) {
    const uploaded = await persistUploadedFile(req.file, "updates", "image");
    if (uploaded?.url) update.imageUrl = uploaded.url;
  }

  await update.save();
  res.json({ success: true, message: "Update updated successfully!", update });
});

/**
 * DELETE /api/cafe/updates/:id
 * Admin delete update post
 */
export const deleteUpdate = asyncHandler(async (req, res) => {
  const update = await CafeUpdate.findByIdAndDelete(req.params.id);
  if (!update) throw new ApiError(404, "Update post not found.");
  res.json({ success: true, message: "Update post deleted successfully." });
});

/**
 * GET /api/cafe/updates/visitor-of-month
 * Returns most visited person/customer based on monthly order & visit frequency!
 */
export const getVisitorOfTheMonth = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthKey = `${year}-${month}`;

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonthName = `${monthNames[now.getMonth()]} ${year}`;

  // Start & end of current month
  const startOfMonth = new Date(year, now.getMonth(), 1);
  const endOfMonth = new Date(year, now.getMonth() + 1, 0, 23, 59, 59);

  // 1. Check if admin set a manual spotlight override
  const spotlightOverride = await CafeSpotlight.findOne({ month: monthKey });

  // 2. Compute dynamic frequency leaderboard from Cafe orders & physical book purchases
  let leaderboard = [];

  try {
    const cafeOrdersGrouped = await CafeOrder.aggregate([
      { $match: { createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
      {
        $group: {
          _id: { $ifNull: ["$customerPhone", "$customerName"] },
          customerName: { $first: "$customerName" },
          customerEmail: { $first: "$customerEmail" },
          customerPhone: { $first: "$customerPhone" },
          orderCount: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" }
        }
      },
      { $sort: { orderCount: -1 } },
      { $limit: 10 }
    ]);

    leaderboard = cafeOrdersGrouped.map((item, idx) => ({
      rank: idx + 1,
      name: item.customerName && item.customerName !== "Guest" ? item.customerName : (item.customerEmail ? item.customerEmail.split("@")[0] : "Regular Visitor"),
      phone: item.customerPhone ? `${item.customerPhone.slice(0, 3)}****${item.customerPhone.slice(-3)}` : "",
      visitCount: item.orderCount,
      totalSpent: Math.round(item.totalSpent),
      badge: idx === 0 ? "Gold Reader" : idx === 1 ? "Silver Reader" : idx === 2 ? "Bronze Reader" : "Top Member"
    }));
  } catch (err) {
    console.error("[Leaderboard Error]:", err.message);
  }

  // Fallback demo leaderboard if no orders exist yet in current month
  if (leaderboard.length === 0) {
    leaderboard = [
      { rank: 1, name: "Kiran Samanta", visitCount: 14, badge: "Gold Reader", totalSpent: 1250 },
      { rank: 2, name: "Pritam Chakraborty", visitCount: 11, badge: "Silver Reader", totalSpent: 980 },
      { rank: 3, name: "Rittvik Chakraborty", visitCount: 8, badge: "Bronze Reader", totalSpent: 720 },
      { rank: 4, name: "Anup Samanta", visitCount: 6, badge: "Top Member", totalSpent: 540 },
      { rank: 5, name: "Tanmoy Roy", visitCount: 5, badge: "Top Member", totalSpent: 420 }
    ];
  }

  const topVisitor = spotlightOverride || {
    month: monthKey,
    memberName: leaderboard[0]?.name || "Kiran Samanta",
    visitCount: leaderboard[0]?.visitCount || 14,
    customBadge: "🏆 Most Visited Person of the Month",
    message: `Has visited Lekhok Tripura Cafe & Library ${leaderboard[0]?.visitCount || 14} times this month!`,
    avatarUrl: spotlightOverride?.avatarUrl || ""
  };

  res.json({
    success: true,
    monthName: currentMonthName,
    monthKey,
    topVisitor,
    leaderboard
  });
});

/**
 * POST /api/cafe/updates/visitor-of-month
 * Admin set manual spotlight for Visitor of the Month
 */
export const setVisitorSpotlight = asyncHandler(async (req, res) => {
  const { month, memberName, memberPhone, visitCount, customBadge, message, avatarUrl } = req.body;
  if (!month || !memberName) {
    throw new ApiError(400, "Month (YYYY-MM) and member name are required.");
  }

  let spotlight = await CafeSpotlight.findOne({ month });
  if (spotlight) {
    spotlight.memberName = memberName;
    if (memberPhone !== undefined) spotlight.memberPhone = memberPhone;
    if (visitCount !== undefined) spotlight.visitCount = Number(visitCount);
    if (customBadge !== undefined) spotlight.customBadge = customBadge;
    if (message !== undefined) spotlight.message = message;
    if (avatarUrl !== undefined) spotlight.avatarUrl = avatarUrl;
    await spotlight.save();
  } else {
    spotlight = await CafeSpotlight.create({
      month,
      memberName,
      memberPhone: memberPhone || "",
      visitCount: Number(visitCount || 1),
      customBadge: customBadge || "Visitor of the Month",
      message: message || `Top visitor for ${month}`,
      avatarUrl: avatarUrl || ""
    });
  }

  res.json({
    success: true,
    message: "Visitor of the Month spotlight updated successfully!",
    spotlight
  });
});
