import mongoose from "mongoose";

const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    summary: { type: String, required: true, trim: true, maxlength: 500 },
    content: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "Platform Update", index: true },
    isPinned: { type: Boolean, default: false, index: true },
    author: { type: String, default: "Lekhok Tripura Team", trim: true },
    coverImage: {
      url: String,
      publicId: String,
      storage: { type: String, enum: ["local", "cloudinary", "s3", "external"], default: "local" },
      mimeType: String,
      size: Number,
      originalName: String
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

newsSchema.index({ category: 1, isPinned: -1, createdAt: -1 });

export const News = mongoose.model("News", newsSchema);
