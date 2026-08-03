import slugify from "slugify";
import { News } from "../models/News.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";

const LEGACY_CATEGORY_MAP = {
  platform_update: "Platform Update",
  new_release: "New Book Release",
  announcement: "Official Announcement",
  general: "General News"
};

export const listNews = asyncHandler(async (req, res) => {
  // Auto-migrate legacy category slugs in database
  for (const [legacy, clean] of Object.entries(LEGACY_CATEGORY_MAP)) {
    await News.updateMany({ category: legacy }, { $set: { category: clean } });
  }

  const { category, search } = req.query;
  const filter = {};

  if (category && category !== "all" && category !== "All Updates") {
    filter.category = category;
  }

  if (search && search.trim()) {
    const q = search.trim();
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { summary: { $regex: q, $options: "i" } },
      { content: { $regex: q, $options: "i" } }
    ];
  }

  const newsList = await News.find(filter)
    .sort({ isPinned: -1, createdAt: -1 });

  res.json({
    success: true,
    news: newsList
  });
});

export const getNewsBySlug = asyncHandler(async (req, res) => {
  const news = await News.findOne({ slug: req.params.slug });
  if (!news) throw new ApiError(404, "News announcement not found.");

  res.json({
    success: true,
    news
  });
});

export const createNews = asyncHandler(async (req, res) => {
  const { title, summary, content, category, isPinned, author } = req.body;

  if (!title || !summary || !content) {
    throw new ApiError(400, "Title, summary, and content are required.");
  }

  const baseSlug = slugify(title, { lower: true, strict: true }) || "announcement";
  let slug = baseSlug;
  let counter = 1;

  while (await News.exists({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  let coverImage = undefined;
  if (req.file) {
    coverImage = await persistUploadedFile(req.file, "news", "image");
  }

  const news = await News.create({
    title,
    slug,
    summary,
    content,
    category: category || "platform_update",
    isPinned: isPinned === true || isPinned === "true",
    author: author || "Lekhok Tripura Team",
    coverImage,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: "News & Update published successfully!",
    news
  });
});

export const updateNews = asyncHandler(async (req, res) => {
  const news = await News.findById(req.params.id);
  if (!news) throw new ApiError(404, "News announcement not found.");

  const { title, summary, content, category, isPinned, author } = req.body;

  if (title && title !== news.title) {
    const baseSlug = slugify(title, { lower: true, strict: true }) || "announcement";
    let slug = baseSlug;
    let counter = 1;

    while (await News.exists({ slug, _id: { $ne: news._id } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    news.slug = slug;
    news.title = title;
  }

  if (summary !== undefined) news.summary = summary;
  if (content !== undefined) news.content = content;
  if (category !== undefined) news.category = category;
  if (isPinned !== undefined) news.isPinned = isPinned === true || isPinned === "true";
  if (author !== undefined) news.author = author;

  if (req.file) {
    news.coverImage = await persistUploadedFile(req.file, "news", "image");
  }

  await news.save();

  res.json({
    success: true,
    message: "News announcement updated successfully!",
    news
  });
});

export const deleteNews = asyncHandler(async (req, res) => {
  const news = await News.findByIdAndDelete(req.params.id);
  if (!news) throw new ApiError(404, "News announcement not found.");

  res.json({
    success: true,
    message: "News announcement deleted successfully."
  });
});

export const renameCategory = asyncHandler(async (req, res) => {
  const { oldCategory, newCategory } = req.body;
  if (!oldCategory || !newCategory || !newCategory.trim()) {
    throw new ApiError(400, "Old category and new category names are required.");
  }

  const targetName = newCategory.trim();
  const result = await News.updateMany(
    { category: oldCategory },
    { $set: { category: targetName } }
  );

  res.json({
    success: true,
    message: `Renamed category '${oldCategory}' to '${targetName}' across ${result.modifiedCount} posts.`,
    modifiedCount: result.modifiedCount
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { category, fallbackCategory, deletePosts } = req.body;
  if (!category) {
    throw new ApiError(400, "Category name is required.");
  }

  if (deletePosts) {
    const result = await News.deleteMany({ category });
    return res.json({
      success: true,
      message: `Deleted category '${category}' and removed ${result.deletedCount} posts.`,
      modifiedCount: result.deletedCount
    });
  }

  const targetFallback = (fallbackCategory && fallbackCategory.trim()) ? fallbackCategory.trim() : "General News";
  const result = await News.updateMany(
    { category },
    { $set: { category: targetFallback } }
  );

  res.json({
    success: true,
    message: `Deleted category '${category}' and reassigned ${result.modifiedCount} posts to '${targetFallback}'.`,
    modifiedCount: result.modifiedCount
  });
});
