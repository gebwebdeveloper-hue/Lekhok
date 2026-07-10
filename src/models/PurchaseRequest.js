import mongoose from "mongoose";

const purchaseRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    format: { type: String, enum: ["ebook", "paperback", "hardcover"], default: "ebook", index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    transactionNumber: { type: String, trim: true, index: true },
    paymentScreenshot: {
      url: String,
      publicId: String,
      storage: { type: String, enum: ["local", "cloudinary", "s3", "external"], default: "local" },
      mimeType: String,
      size: Number,
      originalName: String
    },
    note: { type: String, trim: true, maxlength: 500 },
    deliveryAddress: {
      co: { type: String, trim: true, maxlength: 120 },
      country: { type: String, trim: true, default: "India", maxlength: 80 },
      district: { type: String, trim: true, maxlength: 80 },
      block: { type: String, trim: true, maxlength: 80 },
      pin: { type: String, trim: true, maxlength: 10 },
      postOffice: { type: String, trim: true, maxlength: 80 },
      nearbyLocation: { type: String, trim: true, maxlength: 200 }
    },
    adminNote: { type: String, trim: true, maxlength: 500 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: Date
  },
  { timestamps: true }
);

purchaseRequestSchema.index({ userId: 1, bookId: 1, format: 1, status: 1 });

export const PurchaseRequest = mongoose.model("PurchaseRequest", purchaseRequestSchema);

