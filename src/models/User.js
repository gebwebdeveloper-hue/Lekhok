import mongoose from "mongoose";

const followUpLogSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    note: { type: String, required: true, trim: true },
    adminName: { type: String, default: "Admin", trim: true },
    status: { type: String, default: "Logged", trim: true },
    sentiment: { type: String, default: "Neutral", trim: true },
    paymentStatus: { type: String, default: "Pending", trim: true }
  },
  { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    verified: { type: Boolean, default: false },
    lastLoginAt: Date,
    co: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 20 },
    avatarUrl: { type: String, default: "" },
    age: { type: Number, min: 1, max: 120 },
    country: { type: String, trim: true, default: "India", maxlength: 80 },
    district: { type: String, trim: true, maxlength: 80 },
    block: { type: String, trim: true, maxlength: 80 },
    pin: { type: String, trim: true, maxlength: 10 },
    postOffice: { type: String, trim: true, maxlength: 80 },
    nearbyLocation: { type: String, trim: true, maxlength: 200 },
    memberId: { type: String, trim: true, default: "", index: true },
    // ── CRM SPECIFIC ATTRIBUTES ──
    followUpCount: { type: Number, default: 0 },
    followUpLogs: [followUpLogSchema],
    sentiment: {
      type: String,
      enum: ["Positive", "Negative", "Neutral", "Hot Lead", "Cold Lead"],
      default: "Neutral",
      index: true
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Partial", "Refunded"],
      default: "Pending",
      index: true
    },
    paymentAmount: { type: Number, default: 0 },
    crmNotes: { type: String, default: "", trim: true },
    nextFollowUpDate: { type: Date },
    lastFollowUpAt: { type: Date }
  },
  { timestamps: true }
);

userSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

export const User = mongoose.model("User", userSchema);
