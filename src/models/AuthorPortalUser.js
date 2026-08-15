import mongoose from "mongoose";
import { authorDb } from "../config/database.js";

const workflowStepSchema = new mongoose.Schema(
  {
    stepNumber: { type: Number, required: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "Pending", "In Progress", "Completed"], default: "PENDING" },
    value: { type: String, default: "" }
  },
  { _id: false }
);

const authorBookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    isbn: { type: String, default: "" },
    copiesPrinted: { type: Number, default: 0 },
    copiesSold: { type: Number, default: 0 },
    currentStock: { type: Number, default: 0 },
    stockStatus: { type: String, enum: ["LOW STOCK", "IN STOCK", "OUT OF STOCK"], default: "LOW STOCK" },
  },
  { _id: true }
);

const addOnServiceSchema = new mongoose.Schema(
  {
    service: { type: String, required: true },
    details: { type: String, default: "" },
    expense: { type: Number, default: 0 },
    status: { type: String, default: "PENDING" },
  },
  { _id: true }
);

const authorDocumentSchema = new mongoose.Schema(
  {
    bookTitle: { type: String, default: "" },
    documentName: { type: String, required: true },
    fileUrl: { type: String, required: true },
  },
  { _id: true }
);

const authorPortalUserSchema = new mongoose.Schema(
  {
    authorId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, default: "author", index: true },
    selectedPlan: { type: String, default: "Basic Publishing Plan" },
    planDetails: { type: String, default: "Standard Book Publishing Package" },
    publishingPaymentStatus: { type: String, enum: ["PENDING", "PAID", "Pending", "Paid"], default: "PENDING" },
    invoiceUrl: { type: String, default: "" },
    planAmount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    paymentMethod: { type: String, default: "UPI" },
    paymentDate: { type: String, default: "" },

    // Execution Specifications
    pageCount: { type: Number, default: 0 },
    isbnNo: { type: String, default: "" },
    totalCopiesPrinted: { type: Number, default: 0 },
    damagedCopies: { type: Number, default: 0 },
    complimentaryCopies: { type: Number, default: 0 },
    authorCopies: { type: Number, default: 0 },

    // Status Badges
    bookCoverStatus: { type: String, default: "Pending" },
    bookFormattingStatus: { type: String, default: "Pending" },
    bookReadyToPrintStatus: { type: String, default: "Pending" },
    printingStatus: { type: String, default: "Pending" },
    deliveryStatus: { type: String, default: "Pending" },

    // Approvals
    coverApproval: { type: String, default: "Pending" },
    formattingApproval: { type: String, default: "Pending" },
    finalProofApproval: { type: String, default: "Pending" },

    // Delivery Tracking
    courierPartner: { type: String, default: "" },
    trackingNumber: { type: String, default: "" },
    dispatchDate: { type: String, default: "" },
    expectedDeliveryDate: { type: String, default: "" },

    workflowSteps: {
      type: [workflowStepSchema],
      default: [
        { stepNumber: 1, name: "Payment", status: "PENDING", value: "" },
        { stepNumber: 2, name: "ISBN Generated", status: "PENDING", value: "" },
        { stepNumber: 3, name: "Book Page", status: "PENDING", value: "" },
        { stepNumber: 4, name: "Book Cover", status: "PENDING", value: "" },
        { stepNumber: 5, name: "Formatting", status: "PENDING", value: "" },
        { stepNumber: 6, name: "Author Approval", status: "PENDING", value: "" },
        { stepNumber: 7, name: "Ready to Print", status: "PENDING", value: "" },
        { stepNumber: 8, name: "Printing", status: "PENDING", value: "" },
        { stepNumber: 9, name: "Stock Ready", status: "PENDING", value: "" },
        { stepNumber: 10, name: "Delivery", status: "PENDING", value: "" },
        { stepNumber: 11, name: "Published", status: "PENDING", value: "" }
      ]
    },

    books: [authorBookSchema],
    addOnServices: [addOnServiceSchema],
    documents: [authorDocumentSchema],

    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    netAuthorProfit: { type: Number, default: 0 },
    totalDeduction: { type: Number, default: 0 },
    royaltyPaymentStatus: { type: String, enum: ["PENDING", "PAID", "Pending", "Paid"], default: "PENDING" }
  },
  { timestamps: true }
);

authorPortalUserSchema.set("toJSON", {
  transform(_doc, ret) {
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  }
});

export const AuthorPortalUser = authorDb.model("AuthorPortalUser", authorPortalUserSchema);
