import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    summary: { type: String, required: true, trim: true, maxlength: 1000 },
    content: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, default: "General", index: true },
    isPinned: { type: Boolean, default: false, index: true },
    author: { type: String, default: "Lekhok Tripura Team", trim: true },
    imageCaption: { type: String, trim: true, default: "" },
    coverImage: {
      url: String,
      publicId: String,
      storage: { type: String, enum: ["local", "cloudinary", "s3", "external"], default: "local" },
      mimeType: String,
      size: Number,
      originalName: String
    },
    views: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

blogSchema.index({ category: 1, isPinned: -1, createdAt: -1 });

export const Blog = mongoose.model("Blog", blogSchema);
