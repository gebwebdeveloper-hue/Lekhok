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

const paymentConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    upiId: { type: String, required: true },
    upiQrImage: assetSchema
  },
  { timestamps: true }
);

export const PaymentConfig = mongoose.model("PaymentConfig", paymentConfigSchema);
