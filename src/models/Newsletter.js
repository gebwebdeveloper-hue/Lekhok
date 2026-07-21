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

const newsletterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    content: { type: String, required: true },
    cover: assetSchema,
    author: { type: String, default: "Lekhok Tripura", trim: true },
    status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
    publishedAt: { type: Date, default: Date.now },
    readingTime: { type: Number, default: 0 },
    fontFamily: { type: String, default: "Outfit", trim: true },
    price: { type: Number, default: 0, min: 0 },
    isPaid: { type: Boolean, default: false },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category", index: true }]
  },
  { timestamps: true }
);

newsletterSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const Newsletter = mongoose.model("Newsletter", newsletterSchema);
