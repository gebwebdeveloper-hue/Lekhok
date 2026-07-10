import { Book } from "../models/Book.js";
import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { User } from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

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
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, users });
});