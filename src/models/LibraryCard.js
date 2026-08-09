import mongoose from "mongoose";

const libraryCardSchema = new mongoose.Schema(
  {
    cardId: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userName: { type: String, required: true, trim: true },
    userEmail: { type: String, required: true, trim: true, lowercase: true },
    userPhone: { type: String, required: true, trim: true },
    dob: { type: String, trim: true, default: "" },
    fatherName: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "Tripura" },
    district: { type: String, trim: true, default: "" },
    villageTown: { type: String, trim: true, default: "" },
    postOffice: { type: String, trim: true, default: "" },
    pinCode: { type: String, trim: true, default: "" },
    policeStation: { type: String, trim: true, default: "" },
    emergencyContact: { type: String, trim: true, default: "" },
    co: { type: String, trim: true, default: "" },
    fullAddress: { type: String, trim: true, default: "" },
    cardFee: { type: Number, default: 99 },
    gstAmount: { type: Number, default: 17.82 },
    totalAmount: { type: Number, default: 116.82 },
    paymentId: { type: String, default: "" },
    orderId: { type: String, default: "" },
    pdfUrl: { type: String, required: true },
    issuedAt: { type: Date, default: Date.now },
    validUntil: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "suspended"], default: "active", index: true }
  },
  { timestamps: true }
);

libraryCardSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const LibraryCard = mongoose.model("LibraryCard", libraryCardSchema);
