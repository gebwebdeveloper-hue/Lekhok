import mongoose from "mongoose";

const bookmarkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true, index: true },
    page: { type: Number, required: true, min: 1 },
    label: { type: String, trim: true, maxlength: 120 },
    note: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

bookmarkSchema.index({ userId: 1, bookId: 1, page: 1 }, { unique: true });

export const Bookmark = mongoose.model("Bookmark", bookmarkSchema);