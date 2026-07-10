import { Author } from "../models/Author.js";
import { Book } from "../models/Book.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";

/** GET /api/authors — public, lists all featured authors ordered by order field */
export const listAuthors = asyncHandler(async (_req, res) => {
  const authors = await Author.find({ featured: true }).sort({ order: 1, createdAt: -1 });
  // Attach book count per author
  const names = authors.map((a) => a.name);
  const counts = await Book.aggregate([
    { $match: { author: { $in: names } } },
    { $group: { _id: "$author", count: { $sum: 1 } } }
  ]);
  const countMap = Object.fromEntries(counts.map(({ _id, count }) => [_id, count]));
  const result = authors.map((a) => ({ ...a.toJSON(), bookCount: countMap[a.name] || 0 }));
  res.json({ success: true, authors: result });
});

/** GET /api/authors/all — admin only, lists all authors regardless of featured */
export const listAllAuthors = asyncHandler(async (_req, res) => {
  const authors = await Author.find().sort({ order: 1, createdAt: -1 });
  res.json({ success: true, authors });
});

/** POST /api/authors — admin only, create author */
export const createAuthor = asyncHandler(async (req, res) => {
  const { name, bio, featured, order } = req.body;
  if (!name) throw new ApiError(400, "Author name is required.");
  const thumbnail = await persistUploadedFile(req.file, "authors", "image");
  const author = await Author.create({
    name,
    bio,
    thumbnail,
    featured: featured === "true" || featured === true,
    order: order !== undefined ? Number(order) : 0
  });
  res.status(201).json({ success: true, author });
});

/** PUT /api/authors/:id — admin only, update author */
export const updateAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id);
  if (!author) throw new ApiError(404, "Author not found.");
  const { name, bio, featured, order } = req.body;
  if (name !== undefined) author.name = name;
  if (bio !== undefined) author.bio = bio;
  if (featured !== undefined) author.featured = featured === "true" || featured === true;
  if (order !== undefined) author.order = Number(order);
  if (req.file) {
    const thumbnail = await persistUploadedFile(req.file, "authors", "image");
    if (thumbnail) author.thumbnail = thumbnail;
  }
  await author.save();
  res.json({ success: true, author });
});

/** DELETE /api/authors/:id — admin only, delete author */
export const deleteAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findByIdAndDelete(req.params.id);
  if (!author) throw new ApiError(404, "Author not found.");
  res.json({ success: true, message: "Author deleted." });
});
