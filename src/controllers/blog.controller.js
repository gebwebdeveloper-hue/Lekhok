import slugify from "slugify";
import { Blog } from "../models/Blog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";

export const listBlogs = asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  const filter = {};

  if (category && category !== "all" && category !== "All") {
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

  const blogs = await Blog.find(filter).sort({ isPinned: -1, createdAt: -1 });

  res.json({
    success: true,
    blogs
  });
});

export const getBlogBySlug = asyncHandler(async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug });
  if (!blog) throw new ApiError(404, "Blog article not found.");

  // Increment views asynchronously
  blog.views = (blog.views || 0) + 1;
  await blog.save();

  res.json({
    success: true,
    blog
  });
});

export const createBlog = asyncHandler(async (req, res) => {
  const { title, summary, content, category, isPinned, author, imageCaption } = req.body;

  if (!title || !summary || !content) {
    throw new ApiError(400, "Title, summary (excerpt), and content are required.");
  }

  const baseSlug = slugify(title, { lower: true, strict: true }) || "blog-post";
  let slug = baseSlug;
  let counter = 1;

  while (await Blog.exists({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  let coverImage = undefined;
  if (req.file) {
    coverImage = await persistUploadedFile(req.file, "blogs", "image");
  }

  const blog = await Blog.create({
    title,
    slug,
    summary,
    content,
    category: category || "General",
    isPinned: isPinned === true || isPinned === "true",
    author: author || "Lekhok Tripura Team",
    imageCaption: imageCaption || "",
    coverImage,
    createdBy: req.user._id
  });

  res.status(201).json({
    success: true,
    message: "Blog article published successfully!",
    blog
  });
});

export const updateBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) throw new ApiError(404, "Blog article not found.");

  const { title, summary, content, category, isPinned, author, imageCaption } = req.body;

  if (title && title !== blog.title) {
    const baseSlug = slugify(title, { lower: true, strict: true }) || "blog-post";
    let slug = baseSlug;
    let counter = 1;

    while (await Blog.exists({ slug, _id: { $ne: blog._id } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    blog.slug = slug;
    blog.title = title;
  }

  if (summary !== undefined) blog.summary = summary;
  if (content !== undefined) blog.content = content;
  if (category !== undefined) blog.category = category;
  if (isPinned !== undefined) blog.isPinned = isPinned === true || isPinned === "true";
  if (author !== undefined) blog.author = author;
  if (imageCaption !== undefined) blog.imageCaption = imageCaption;

  if (req.file) {
    blog.coverImage = await persistUploadedFile(req.file, "blogs", "image");
  }

  await blog.save();

  res.json({
    success: true,
    message: "Blog article updated successfully!",
    blog
  });
});

export const deleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findByIdAndDelete(req.params.id);
  if (!blog) throw new ApiError(404, "Blog article not found.");

  res.json({
    success: true,
    message: "Blog article deleted successfully."
  });
});

export const renameCategory = asyncHandler(async (req, res) => {
  const { oldCategory, newCategory } = req.body;
  if (!oldCategory || !newCategory || !newCategory.trim()) {
    throw new ApiError(400, "Old category and new category names are required.");
  }

  const targetName = newCategory.trim();
  const result = await Blog.updateMany(
    { category: oldCategory },
    { $set: { category: targetName } }
  );

  res.json({
    success: true,
    message: `Renamed category '${oldCategory}' to '${targetName}' across ${result.modifiedCount} blog posts.`,
    modifiedCount: result.modifiedCount
  });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { category, fallbackCategory, deletePosts } = req.body;
  if (!category) {
    throw new ApiError(400, "Category name is required.");
  }

  if (deletePosts) {
    const result = await Blog.deleteMany({ category });
    return res.json({
      success: true,
      message: `Deleted category '${category}' and removed ${result.deletedCount} blog posts.`,
      modifiedCount: result.deletedCount
    });
  }

  const targetFallback = (fallbackCategory && fallbackCategory.trim()) ? fallbackCategory.trim() : "General";
  const result = await Blog.updateMany(
    { category },
    { $set: { category: targetFallback } }
  );

  res.json({
    success: true,
    message: `Deleted category '${category}' and reassigned ${result.modifiedCount} blog posts to '${targetFallback}'.`,
    modifiedCount: result.modifiedCount
  });
});
