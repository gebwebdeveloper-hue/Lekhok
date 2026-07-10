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

const authorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    bio: { type: String, trim: true, maxlength: 600 },
    thumbnail: assetSchema,
    featured: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

authorSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const Author = mongoose.model("Author", authorSchema);
