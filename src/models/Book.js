import mongoose from "mongoose";

const assetSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    storage: { type: String, enum: ["local", "cloudinary", "s3", "external"], default: "local" },
    mimeType: String,
    size: Number,
    originalName: String
  },
  { _id: false }
);

const bookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    author: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 6000 },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true, index: true },
    language: { type: String, default: "English", trim: true },
    pages: { type: Number, required: true, min: 1 },
    cover: assetSchema,
    previewImages: [assetSchema],
    previewPdf: assetSchema,
    pdf: assetSchema,
    tags: [{ type: String, trim: true, lowercase: true }],
    featured: { type: Boolean, default: false, index: true },
    trending: { type: Boolean, default: false, index: true },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    publishedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

bookSchema.index(
  { title: "text", author: "text", description: "text", tags: "text" },
  { language_override: "none" }
);

bookSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const Book = mongoose.model("Book", bookSchema);