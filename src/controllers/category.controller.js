import slugify from "slugify";
import { Category } from "../models/Category.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";

/** GET /api/categories — Lists all categories sorted alphabetically by name */
export const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find().sort({ name: 1 });
  res.json({ success: true, categories });
});

/** POST /api/categories — Admin-only, creates a new category (generates slug) */
export const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(400, "Category name is required.");
  }

  const trimmedName = name.trim();
  let slug = slugify(trimmedName, { lower: true, strict: true, trim: true });
  
  if (!slug) {
    // Universal Unicode fallback to support Bengali, Hindi, etc.
    slug = trimmedName
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "") // Keep letters, numbers, spaces, and hyphens
      .trim()
      .replace(/\s+/g, "-");
  }

  if (!slug) {
    slug = `cat-${Date.now()}`;
  }

  // Check if a category with this name or slug already exists (case-insensitive check)
  const exists = await Category.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } },
      { slug }
    ]
  });

  if (exists) {
    throw new ApiError(400, "Category with this name or slug already exists.");
  }

  const category = await Category.create({ name: trimmedName, slug });
  res.status(201).json({ success: true, category });
});

/** DELETE /api/categories/:id — Admin-only, deletes a category */
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) {
    throw new ApiError(404, "Category not found.");
  }
  res.json({ success: true, message: "Category deleted successfully." });
});
