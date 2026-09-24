import mongoose from "mongoose";

const careerResponseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      required: [true, "Candidate Name is required"],
      trim: true,
    },
    number: {
      type: String,
      required: [true, "Phone Number is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email Address is required"],
      trim: true,
      lowercase: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    district: {
      type: String,
      default: "",
      trim: true,
    },
    hometown: {
      type: String,
      required: [true, "Hometown is required"],
      trim: true,
    },
    pin: {
      type: String,
      required: [true, "Pin code is required"],
      trim: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    role: {
      type: String,
      required: [true, "Target Role is required"],
      trim: true,
      enum: [
        "Sales",
        "Marketing",
        "Cover artist",
        "Book editor",
        "Accountant",
        "Designer role",
        "Office assistant",
        "Other",
      ],
    },
    experience: {
      type: String,
      required: [true, "Experience / Bio is required"],
      trim: true,
    },
    portfolioUrl: {
      type: String,
      default: "",
      trim: true,
    },
    resumeUrl: {
      type: String,
      default: "",
      trim: true,
    },
    resumeFile: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
      storage: { type: String, enum: ["local", "cloudinary", "s3", "external"], default: "local" },
      originalName: { type: String, default: "" },
      size: { type: Number, default: 0 },
      mimeType: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["Pending", "Reviewed", "Shortlisted", "Interviewed", "Hired", "Rejected"],
      default: "Pending",
      index: true,
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast administrative search & filtering
careerResponseSchema.index({ createdAt: -1 });
careerResponseSchema.index({ role: 1, status: 1 });
careerResponseSchema.index({ name: "text", email: "text", number: "text", hometown: "text" });

export const CareerResponse = mongoose.model("CareerResponse", careerResponseSchema);
