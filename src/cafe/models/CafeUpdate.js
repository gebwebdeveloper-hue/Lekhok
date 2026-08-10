import mongoose from "mongoose";

const cafeUpdateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    category: {
      type: String,
      enum: ["Announcement", "Special Offer", "New Arrival", "Event", "Notice"],
      default: "Announcement"
    },
    imageUrl: { type: String, trim: true },
    isPinned: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    authorName: { type: String, default: "Lekhok Tripura Admin", trim: true },
    viewsCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const CafeUpdate = mongoose.model("CafeUpdate", cafeUpdateSchema);
