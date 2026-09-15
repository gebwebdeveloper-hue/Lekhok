import mongoose from "mongoose";

const pwuResponseSchema = new mongoose.Schema(
  {
    authorName: {
      type: String,
      required: [true, "Author Name is required"],
      trim: true,
    },
    authorNumber: {
      type: String,
      required: [true, "Author Number is required"],
      trim: true,
    },
    authorEmail: {
      type: String,
      required: [true, "Author Mail ID is required"],
      trim: true,
      lowercase: true,
    },
    authorAddress: {
      type: String,
      required: [true, "Author Address is required"],
      trim: true,
    },
    bookName: {
      type: String,
      required: [true, "Book Name is required"],
      trim: true,
    },
    bookLanguage: {
      type: String,
      required: [true, "Book Language is required"],
      trim: true,
      default: "Bengali",
    },
    bookPageCount: {
      type: String,
      required: [true, "Book Page Count (A5) is required"],
      trim: true,
    },
    copiesNeeded: {
      type: String,
      required: [true, "Number of copies to be printed is required"],
      trim: true,
    },
    selectedAddons: {
      type: [String],
      default: [],
    },
    planType: {
      type: String,
      default: "Basic Plan",
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Contacted", "Quotation Sent", "In Progress", "Completed", "Cancelled"],
      default: "Pending",
    },
    adminNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

pwuResponseSchema.index({ authorName: "text", bookName: "text", authorEmail: "text", authorNumber: "text" });

export const PwuResponse = mongoose.model("PwuResponse", pwuResponseSchema);
