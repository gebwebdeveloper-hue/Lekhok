import mongoose from "mongoose";

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
    country: { type: String, trim: true, default: "India", maxlength: 80 },
    district: { type: String, trim: true, maxlength: 80 },
    block: { type: String, trim: true, maxlength: 80 },
    pin: { type: String, trim: true, maxlength: 10 },
    postOffice: { type: String, trim: true, maxlength: 80 },
    nearbyLocation: { type: String, trim: true, maxlength: 200 }
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