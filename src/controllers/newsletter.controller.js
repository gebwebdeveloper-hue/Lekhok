import slugify from "slugify";
import { Newsletter } from "../models/Newsletter.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";

function getFile(files, key) {
  return files?.[key]?.[0];
}

async function uniqueSlug(title, currentId = null) {
  const base = slugify(title, { lower: true, strict: true, trim: true });
  let slug = base;
  let index = 2;
  while (await Newsletter.exists({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${base}-${index++}`;
  }
  return slug;
}

function calculateReadingTime(htmlContent) {
  if (!htmlContent) return 0;
  // Strip HTML tags to get raw text
  const text = htmlContent.replace(/<[^>]*>/g, " ");
  // Count words
  const words = text.split(/\s+/).filter(Boolean).length;
  // Average reading speed is ~200 words per minute
  return Math.ceil(words / 200) || 1;
}

export const listNewsletters = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, all = "false" } = req.query;
  
  const filter = {};
  // Only admin can see drafts, others see only published
  const isAdmin = req.user?.role === "admin";
  if (!isAdmin || all !== "true") {
    filter.status = "published";
  }

  const pageNumber = Math.max(Number(page), 1);
  const pageSize = Math.min(Math.max(Number(limit), 1), 100);

  const [newsletters, total] = await Promise.all([
    Newsletter.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize),
    Newsletter.countDocuments(filter)
  ]);

  res.json({
    success: true,
    newsletters,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      pages: Math.ceil(total / pageSize)
    }
  });
});

export const getNewsletterBySlug = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findOne({ slug: req.params.slug });
  if (!newsletter) throw new ApiError(404, "Story not found.");

  // Access check: only admin can view draft stories
  if (newsletter.status === "draft") {
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin) {
      throw new ApiError(403, "Access denied. This story is not yet published.");
    }
  }

  res.json({ success: true, newsletter });
});

export const createNewsletter = asyncHandler(async (req, res) => {
  const body = req.body;
  const coverFile = getFile(req.files, "cover");
  const cover = await persistUploadedFile(coverFile, "covers", "image");

  const readingTime = calculateReadingTime(body.content);
  const slug = body.slug || await uniqueSlug(body.title);

  const newsletter = await Newsletter.create({
    title: body.title,
    slug,
    description: body.description,
    content: body.content,
    cover,
    author: body.author || "Lekhok Tripura",
    status: body.status || "draft",
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
    readingTime,
    fontFamily: body.fontFamily || "Outfit"
  });

  res.status(201).json({ success: true, newsletter });
});

export const updateNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findById(req.params.id);
  if (!newsletter) throw new ApiError(404, "Story not found.");

  const body = req.body;
  const updates = { ...body };

  if (body.title && body.title !== newsletter.title) {
    updates.slug = body.slug || await uniqueSlug(body.title, newsletter._id);
  }

  if (body.content !== undefined) {
    updates.readingTime = calculateReadingTime(body.content);
  }

  if (body.publishedAt) {
    updates.publishedAt = new Date(body.publishedAt);
  }

  const coverFile = getFile(req.files, "cover");
  const cover = await persistUploadedFile(coverFile, "covers", "image");
  if (cover) {
    updates.cover = cover;
  }

  const updated = await Newsletter.findByIdAndUpdate(newsletter._id, updates, {
    new: true,
    runValidators: true
  });

  res.json({ success: true, newsletter: updated });
});

export const deleteNewsletter = asyncHandler(async (req, res) => {
  const newsletter = await Newsletter.findByIdAndDelete(req.params.id);
  if (!newsletter) throw new ApiError(404, "Story not found.");
  res.json({ success: true, message: "Story deleted successfully." });
});

export const uploadInlineImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "No image file uploaded.");

  const result = await persistUploadedFile(req.file, "newsletters", "image");
  if (!result) throw new ApiError(500, "Failed to upload image.");

  res.json({
    success: true,
    url: result.url
  });
});
