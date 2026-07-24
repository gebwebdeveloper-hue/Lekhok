import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";

export const getDashboardAnalytics = asyncHandler(async (_req, res) => {
  const [books, users, pendingPurchases, approvedPurchases, revenue] = await Promise.all([
    Book.countDocuments(),
    User.countDocuments(),
    PurchaseRequest.countDocuments({ status: "pending" }),
    PurchaseRequest.countDocuments({ status: "approved" }),
    PurchaseRequest.aggregate([{ $match: { status: "approved" } }, { $group: { _id: null, total: { $sum: "$amount" } } }])
  ]);

  res.json({
    success: true,
    analytics: {
      books,
      users,
      pendingPurchases,
      approvedPurchases,
      revenue: revenue[0]?.total || 0
    }
  });
});

export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).select("-password").lean();
  const purchases = await PurchaseRequest.find()
    .populate("userId", "name email role phone")
    .populate("bookId", "title cover price author paperbackPrice hardcoverPrice")
    .sort({ createdAt: -1 })
    .lean();

  const userMap = {};

  users.forEach((u) => {
    const id = u._id.toString();
    userMap[id] = {
      ...u,
      purchases: [],
      totalBooksBought: 0,
      totalSpent: 0
    };
  });

  purchases.forEach((p) => {
    if (!p.userId) return;
    const uObj = typeof p.userId === "object" ? p.userId : { _id: p.userId };
    const id = uObj._id ? uObj._id.toString() : String(p.userId);

    if (!userMap[id]) {
      userMap[id] = {
        _id: uObj._id || p.userId,
        name: uObj.name || "Reader",
        email: uObj.email || "No Email",
        phone: uObj.phone || "",
        role: uObj.role || "user",
        createdAt: p.createdAt,
        purchases: [],
        totalBooksBought: 0,
        totalSpent: 0
      };
    }

    userMap[id].purchases.push(p);
    if (p.status === "approved") {
      userMap[id].totalBooksBought += 1;
      userMap[id].totalSpent += (p.amount || 0);
    }
  });

  const enrichedUsers = Object.values(userMap);
  res.json({ success: true, users: enrichedUsers });
});

export const revokeUserPurchase = asyncHandler(async (req, res) => {
  const { purchaseId } = req.params;
  const { reason } = req.body;

  const purchase = await PurchaseRequest.findById(purchaseId);
  if (!purchase) throw new ApiError(404, "Purchase request not found.");

  purchase.status = "rejected";
  purchase.adminNote = reason || "Access revoked by admin due to policy violation.";
  purchase.rejectedBy = req.user._id;
  purchase.rejectedAt = new Date();
  await purchase.save();

  res.json({
    success: true,
    message: "Access revoked successfully for this user.",
    purchase
  });
});