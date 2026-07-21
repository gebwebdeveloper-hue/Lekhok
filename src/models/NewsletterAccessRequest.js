import mongoose from "mongoose";

const newsletterAccessRequestSchema = new mongoose.Schema(
  {
    newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true, index: true },
    userName: { type: String, required: true, trim: true },
    userEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    userPhone: { type: String, required: true, trim: true },
    transactionId: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    adminNote: { type: String, trim: true, maxlength: 500 },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: Date
  },
  { timestamps: true }
);

newsletterAccessRequestSchema.index({ newsletterId: 1, userEmail: 1, status: 1 });
newsletterAccessRequestSchema.index({ newsletterId: 1, transactionId: 1 });

export const NewsletterAccessRequest = mongoose.model("NewsletterAccessRequest", newsletterAccessRequestSchema);
