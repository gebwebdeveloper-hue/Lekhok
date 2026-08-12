import { cafeDb } from "../../config/database.js";
import mongoose from "mongoose";

/**
 * CafeCategory — stores admin-configured display info for each menu category.
 * One doc per category (upserted by admin). If missing, the menu page falls back
 * to a sensible default derived from the category id.
 */
const cafeCategorySchema = new mongoose.Schema(
  {
    // matches CafeMenuItem.category enum value
    categoryId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      enum: ["coffee", "tea", "cold-drinks", "snacks", "meals", "desserts", "others"],
    },
    // Heading shown on the public menu page, e.g. "COFFEE COLLECTION"
    title: { type: String, trim: true, default: "" },
    // Subtitle shown below the heading, e.g. "RICH AROMA. PERFECT BREW."
    subtitle: { type: String, trim: true, default: "" },
    // Sort order of sections on the page
    sortOrder: { type: Number, default: 99 },
  },
  { timestamps: true }
);

cafeCategorySchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export const CafeCategory = cafeDb.model("CafeCategory", cafeCategorySchema);
