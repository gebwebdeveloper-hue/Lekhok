import mongoose from "mongoose";

const cafeSpotlightSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, index: true }, // Format: "YYYY-MM" (e.g. "2026-08")
    memberName: { type: String, required: true, trim: true },
    memberPhone: { type: String, trim: true },
    visitCount: { type: Number, default: 1 },
    customBadge: { type: String, default: "Visitor of the Month", trim: true },
    message: { type: String, trim: true },
    avatarUrl: { type: String, trim: true }
  },
  { timestamps: true }
);

export const CafeSpotlight = mongoose.model("CafeSpotlight", cafeSpotlightSchema);
