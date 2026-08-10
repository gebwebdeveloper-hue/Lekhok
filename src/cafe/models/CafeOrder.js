import { cafeDb } from "../../config/database.js";
import mongoose from "mongoose";

const cafeOrderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "CafeMenuItem" },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  category: { type: String, default: "others" },
  imageUrl: { type: String, default: "" },
});

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  note: { type: String, default: "" },
});

const cafeOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    customerName: { type: String, default: "Guest" },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    items: [cafeOrderItemSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    paymentMethod: { type: String, default: "razorpay" },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    status: {
      type: String,
      enum: ["New Order", "Accepted", "Confirmed", "Preparing", "Ready", "Collected"],
      default: "New Order",
    },
    customerNotified: { type: Boolean, default: false },
    statusHistory: [statusHistorySchema],
  },
  { timestamps: true }
);

cafeOrderSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const CafeOrder = cafeDb.model("CafeOrder", cafeOrderSchema);
