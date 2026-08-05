import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { ReadingProgress } from "../models/ReadingProgress.js";
import { Bookmark } from "../models/Bookmark.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import { User } from "../models/User.js";

export const getProfile = asyncHandler(async (req, res) => {
  const [purchases, readingHistory, bookmarks] = await Promise.all([
    PurchaseRequest.find({ userId: req.user._id }).populate("bookId").sort({ createdAt: -1 }),
    ReadingProgress.find({ userId: req.user._id }).populate("bookId").sort({ lastReadAt: -1 }),
    Bookmark.find({ userId: req.user._id }).populate("bookId").sort({ updatedAt: -1 })
  ]);

  res.json({ success: true, user: req.user, purchases, readingHistory, bookmarks });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const allowedFields = [
    "name", "phone", "age", "avatarUrl", "co", "country",
    "district", "block", "pin", "postOffice", "nearbyLocation"
  ];

  const updateData = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: updateData },
    { new: true, runValidators: true }
  );

  res.json({ success: true, message: "Profile updated successfully.", user: updatedUser });
});