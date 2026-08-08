import { PurchaseRequest } from "../models/PurchaseRequest.js";
import { ReadingProgress } from "../models/ReadingProgress.js";
import { Bookmark } from "../models/Bookmark.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";
import ClubMember from "../models/ClubMember.js";

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

// POST /profile/activate-membership
// Verifies a pasted Member ID against ClubMember collection (email must match the logged-in user)
export const activateMembership = asyncHandler(async (req, res) => {
  const { memberId } = req.body;
  const userEmail = req.user.email;

  if (!memberId) {
    return res.status(400).json({ success: false, message: "Member ID is required." });
  }

  const cleanMemberId = memberId.trim().toUpperCase();

  // Check if memberId is already activated on this account
  if (req.user.memberId && req.user.memberId === cleanMemberId) {
    return res.status(200).json({
      success: true,
      alreadyActive: true,
      message: "This Member ID is already active on your account.",
      memberId: req.user.memberId,
    });
  }

  // Verify memberId exists in ClubMember and matches this user's email
  const clubMember = await ClubMember.findOne({
    memberId: cleanMemberId,
    email: userEmail.trim().toLowerCase(),
    paymentStatus: "paid",
    status: "active",
  });

  if (!clubMember) {
    return res.status(404).json({
      success: false,
      message: "Invalid Member ID, or this Member ID was not registered with your email address. Please copy the exact ID from your confirmation email.",
    });
  }

  // Check if this memberId is already in use by a different user account
  const existingUser = await User.findOne({ memberId: cleanMemberId });
  if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
    return res.status(409).json({
      success: false,
      message: "This Member ID has already been activated on another account.",
    });
  }

  // Save memberId to the user's account
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { memberId: cleanMemberId } },
    { new: true }
  );

  return res.status(200).json({
    success: true,
    message: "Club membership activated successfully! You now have access to member discounts.",
    memberId: cleanMemberId,
    user: updatedUser,
  });
});