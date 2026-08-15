import mongoose from "mongoose";
import { authorDb } from "../config/database.js";

const authorSaleSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, index: true },
    authorEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    bookTitle: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    grossSales: { type: Number, required: true, min: 0 },
    authorProfit: { type: Number, required: true, min: 0 },
    channel: { type: String, default: "Direct / Website" },
    saleDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

authorSaleSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const AuthorSale = authorDb.model("AuthorSale", authorSaleSchema);

