import mongoose from "mongoose";

const bookRentalSchema = new mongoose.Schema(
  {
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    renterName: {
      type: String,
      required: true,
      trim: true,
    },
    renterEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    renterPhone: {
      type: String,
      required: true,
      trim: true,
    },
    dob: { type: String, trim: true, default: "" },
    fatherName: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "Tripura" },
    district: { type: String, trim: true, default: "" },
    villageTown: { type: String, trim: true, default: "" },
    postOffice: { type: String, trim: true, default: "" },
    pinCode: { type: String, trim: true, default: "" },
    policeStation: { type: String, trim: true, default: "" },
    emergencyContact: { type: String, trim: true, default: "" },
    co: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryAddress: {
      type: String,
      required: true,
      trim: true,
    },
    pickupAddress: {
      type: String,
      default: "Madhuban kathaltali, Tarader Thikana, Agartala, Tripura 799003",
    },
    rentalFee: {
      type: Number,
      default: 50,
    },
    gstAmount: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 50,
    },
    finePerDay: {
      type: Number,
      default: 5,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    returnedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "overdue", "return_requested", "returned", "cancelled"],
      default: "active",
      index: true,
    },
    totalFine: {
      type: Number,
      default: 0,
    },
    paymentId: {
      type: String,
      trim: true,
    },
    orderId: {
      type: String,
      trim: true,
    },
    libraryCardId: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    libraryCardPdf: {
      url: String,
      publicId: String,
      storage: { type: String, default: "local" },
    },
    adminNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export const BookRental = mongoose.model("BookRental", bookRentalSchema);
