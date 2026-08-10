import { cafeDb } from "../../config/database.js";
import mongoose from "mongoose";

const cafeSpaceBookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    customerName: { type: String, default: "Guest Reader" },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    spaceType: {
      type: String,
      enum: ["Quiet Reading Nook", "Writer's Desk", "Private Creative Pod", "Group Discussion Pod"],
      required: true,
    },
    bookingDate: { type: String, required: true }, // Format YYYY-MM-DD
    timeSlot: { type: String, required: true }, // e.g. "10:00 AM - 12:00 PM"
    durationHours: { type: Number, default: 2 },
    guestsCount: { type: Number, default: 1 },
    purpose: {
      type: String,
      enum: ["Reading & Studying", "Writing & Creative Work", "Laptop Work", "Group Discussion"],
      default: "Reading & Studying",
    },
    totalAmount: { type: Number, required: true, default: 99 },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    status: {
      type: String,
      enum: ["Confirmed", "Cancelled", "Completed"],
      default: "Confirmed",
    },
  },
  { timestamps: true }
);

export const CafeSpaceBooking = cafeDb.model("CafeSpaceBooking", cafeSpaceBookingSchema);
