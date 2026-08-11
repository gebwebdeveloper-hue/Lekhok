import { cafeDb } from "../../config/database.js";
import mongoose from "mongoose";

const cafeTableSchema = new mongoose.Schema(
  {
    tableNumber: { type: String, required: true, unique: true, trim: true },
    spaceType: {
      type: String,
      enum: ["Book Reader's Corner", "Book Writer's Corner", "Artist Corner", "Group Discussion Pod"],
      required: true,
      default: "Book Reader's Corner"
    },
    capacity: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: ["Available", "Reserved", "Occupied", "Maintenance"],
      default: "Available"
    },
    currentBookingNumber: { type: String, default: "" },
    notes: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

export const CafeTable = cafeDb.model("CafeTable", cafeTableSchema);
