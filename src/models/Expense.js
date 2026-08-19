import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, index: true },
    gstBill: { type: String, default: "YES" },
    itemName: { type: String, required: true },
    purpose: { type: String, default: "General" },
    year: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    date: { type: String, required: true },
    partyName: { type: String, required: true },
    partyNumber: { type: String, default: "N/A" },
    partyEmail: { type: String, default: "N/A" },
    partyAddress: { type: String, default: "N/A" },
    gstRate: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    beforeTaxAmount: { type: Number, default: 0 },
    totalBillAmount: { type: Number, default: 0 },
    billLink: { type: String, default: "#" }
  },
  {
    timestamps: true
  }
);

export const Expense = mongoose.model("Expense", expenseSchema);
