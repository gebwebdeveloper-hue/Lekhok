import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema(
  {
    slNo: { type: Number },
    year: { type: String, required: true, index: true },
    month: { type: String, required: true, index: true },
    invoiceNo: { type: String, required: true, unique: true, index: true },
    date: { type: String, required: true },
    paymentMode: { type: String, default: "Google Pay" },
    customerName: { type: String, default: "Customer" },
    customerPhone: { type: String, default: "N/A" },
    customerEmail: { type: String, default: "N/A" },
    customerAddress: { type: String, default: "N/A" },
    description: { type: String, default: "Goods & Services" },
    qty: { type: Number, default: 1 },
    actualRate: { type: Number, default: 0 },
    taxablePayable: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    deliveryCharges: { type: Number, default: 0 },
    courierName: { type: String, default: "Courier" },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    billLink: { type: String, default: "/admin/invoices" },
    fullForm: { type: mongoose.Schema.Types.Mixed }
  },
  {
    timestamps: true
  }
);

export const Invoice = mongoose.model("Invoice", invoiceSchema);
