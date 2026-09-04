import mongoose from "mongoose";
import slugify from "slugify";
import { News } from "../models/News.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";
import { env } from "../config/env.js";

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

function getOptimizedNewsCover(rawUrl, defaultLogo) {
  if (!rawUrl) {
    return { url: defaultLogo, width: 800, height: 500, type: "image/jpeg" };
  }
  let url = String(rawUrl).trim();
  if (!url.startsWith("http")) {
    const sUrl = (env.serverUrl || "").replace(/\/$/, "");
    url = `${sUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  // Cloudinary on-the-fly transformation:
  // WhatsApp strictly enforces a 300KB limit on og:image and requires JPEG format.
  // This compresses large PNG covers down to ~80KB high-definition JPEGs.
  if (url.includes("res.cloudinary.com") && url.includes("/image/upload/")) {
    url = url
      .replace("/image/upload/", "/image/upload/w_800,h_500,c_fill,q_75,f_jpg/")
      .replace(/\.[a-zA-Z0-9]+(?:\?.*)?$/, ".jpg");
    return { url, width: 800, height: 500, type: "image/jpeg" };
  }

  return { url, width: 800, height: 500, type: "image/jpeg" };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const getNewsOgHtml = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const isObjectId = mongoose.Types.ObjectId.isValid(slug);
  const news = await News.findOne(isObjectId ? { $or: [{ slug }, { _id: slug }] } : { slug });

  const clientUrl = (env.clientUrl || "https://www.lekhoktripura.in").replace(/\/$/, "");
  const defaultLogo = `${clientUrl}/Web.jpeg`;

  if (!news) {
    return res.redirect(302, `${clientUrl}/news`);
  }

  const newsUrl = `${clientUrl}/news?article=${news.slug || news._id}`;
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  const isCrawler = /whatsapp|facebookexternalhit|twitterbot|telegrambot|slackbot|linkedinbot|discordbot|applebot|googlebot|bingbot|pinterest/i.test(userAgent);

  // If a real human visits via standard browser, redirect immediately to the news page
  if (!isCrawler && !req.query.preview && !req.query.bot) {
    return res.redirect(302, newsUrl);
  }

  // Resolve cover URL to an optimized, lightweight JPEG (<100KB) for WhatsApp & social scrapers
  const coverData = getOptimizedNewsCover(news.coverImage?.url, defaultLogo);

  const title = `${news.title} | Lekhok Tripura`;
  const rawDesc = news.summary || news.content || "";
  const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  const description = cleanDesc
    ? (cleanDesc.length > 200 ? cleanDesc.slice(0, 197) + "..." : cleanDesc)
    : `Read "${news.title}" on Lekhok Tripura — Tripura's premier digital literature platform.`;

  const html = `<!doctype html>
<html lang="en" prefix="og: http://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  
  <!-- Primary Meta Tags -->
  <meta name="title" content="${escapeHtml(title)}" />
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(newsUrl)}" />
  <link rel="image_src" href="${escapeHtml(coverData.url)}" />
  
  <!-- Open Graph / WhatsApp / Facebook Preview Tags -->
  <meta property="og:site_name" content="Lekhok Tripura" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${escapeHtml(newsUrl)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(coverData.url)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(coverData.url)}" />
  <meta property="og:image:type" content="${escapeHtml(coverData.type)}" />
  <meta property="og:image:width" content="${coverData.width}" />
  <meta property="og:image:height" content="${coverData.height}" />
  <meta property="og:image:alt" content="${escapeHtml(news.title)}" />
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${escapeHtml(newsUrl)}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(coverData.url)}" />

  <script>
    window.location.replace(${JSON.stringify(newsUrl)});
  </script>
</head>
<body style="background:#09090b;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem;text-align:center;">
  <div style="max-width:420px;border:1px solid rgba(255,255,255,0.12);padding:28px;border-radius:20px;background:#18181b;">
    <img src="${escapeHtml(coverData.url)}" alt="${escapeHtml(news.title)}" style="max-width:100%;border-radius:8px;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,0.5);" />
    <h2 style="margin:0 0 8px 0;font-size:20px;color:#ffffff;">${escapeHtml(news.title)}</h2>
    <p style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:20px;">Opening announcement on Lekhok Tripura...</p>
    <a href="${escapeHtml(newsUrl)}" style="display:inline-block;background:#22d3ee;color:#000000;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">Read Announcement</a>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  return res.send(html);
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
