import { cafeDb } from "../../config/database.js";
import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      required: true,
      enum: ["coffee", "tea", "cold-drinks", "snacks", "meals", "desserts", "others"],
      default: "others",
    },
    imageUrl: { type: String, default: "" },
    available: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    tags: [{ type: String, trim: true }],
    preparationTime: { type: Number, default: 10 }, // minutes
  },
  { timestamps: true }
);

menuItemSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const CafeMenuItem = cafeDb.model("CafeMenuItem", menuItemSchema);
