import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { ReadingProgress } from "../models/ReadingProgress.js";
import { Bookmark } from "../models/Bookmark.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getProfile = asyncHandler(async (req, res) => {
  const [purchases, readingHistory, bookmarks] = await Promise.all([
    PurchaseRequest.find({ userId: req.user._id }).populate("bookId").sort({ createdAt: -1 }),
    ReadingProgress.find({ userId: req.user._id }).populate("bookId").sort({ lastReadAt: -1 }),
    Bookmark.find({ userId: req.user._id }).populate("bookId").sort({ updatedAt: -1 })
  ]);

  res.json({ success: true, user: req.user, purchases, readingHistory, bookmarks });
});