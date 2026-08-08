import mongoose from "mongoose";

const clubMemberSchema = new mongoose.Schema(
  {
    memberId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: "",
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    whatsapp: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      trim: true,
      default: "Member",
    },
    status: {
      type: String,
      enum: ["active", "pending"],
      default: "active",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "free"],
      default: "paid",
    },
    paymentId: {
      type: String,
      default: "",
    },
    orderId: {
      type: String,
      default: "",
    },
    amountPaid: {
      type: Number,
      default: 1178.82,
    },
    dateOfBirth: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
    actionText: {
      type: String,
      default: "",
    },
    portfolioUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("ClubMember", clubMemberSchema);
