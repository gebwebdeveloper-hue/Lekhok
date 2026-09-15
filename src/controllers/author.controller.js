import { Author } from "../models/Author.js";
import { Book } from "../models/Book.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middlewares/error.middleware.js";
import { persistUploadedFile } from "../services/storage.service.js";

/** GET /api/authors — public, lists all featured authors ordered by order field */
export const listAuthors = asyncHandler(async (_req, res) => {
  const authors = await Author.find({
    $or: [{ featured: true }, { ourPublicationAuthor: true }]
  }).sort({ order: 1, createdAt: -1 });
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
  const [authors, books, portalUsers] = await Promise.all([
    Author.find().sort({ order: 1, createdAt: -1 }),
    Book.find({}, "author"),
    AuthorPortalUser.find()
  ]);

  const existingNames = new Set(authors.map((a) => (a.name || "").toLowerCase().trim()));
  const allAuthorsList = [...authors];

  // Auto-discover authors from published books if not yet in Author collection
  const bookAuthorNames = [...new Set(books.map((b) => (b.author || "").trim()).filter(Boolean))];
  for (const bAuth of bookAuthorNames) {
    if (!existingNames.has(bAuth.toLowerCase())) {
      const portalMatch = portalUsers.find((p) => p.name?.toLowerCase().trim() === bAuth.toLowerCase());
      try {
        const createdAuth = await Author.create({
          name: bAuth,
          bio: portalMatch?.planDetails || `Published author on Lekhok Tripura platform.`,
          featured: true,
          ourPublicationAuthor: true,
          order: 99
        });
        allAuthorsList.push(createdAuth);
        existingNames.add(bAuth.toLowerCase());
      } catch (err) {
        console.error("Error auto-creating author doc:", err);
      }
    }
  }

  // Also include portal users
  for (const pu of portalUsers) {
    if (pu.name && !existingNames.has(pu.name.toLowerCase().trim())) {
      try {
        const createdAuth = await Author.create({
          name: pu.name,
          bio: pu.planDetails || "Registered Publication Author",
          featured: false,
          ourPublicationAuthor: true,
          order: 99
        });
        allAuthorsList.push(createdAuth);
        existingNames.add(pu.name.toLowerCase().trim());
      } catch (err) {
        console.error("Error auto-creating portal author doc:", err);
      }
    }
  }

  res.json({ success: true, authors: allAuthorsList });
});

import { createOrUpdateAuthorFromForm } from "../utils/authorAuth.js";

/** POST /api/authors — admin only, create author */
export const createAuthor = asyncHandler(async (req, res) => {
  const { name, bio, featured, ourPublicationAuthor, order, email } = req.body;
  if (!name) throw new ApiError(400, "Author name is required.");
  const thumbnail = await persistUploadedFile(req.file, "authors", "image");
  const isPubAuthor = ourPublicationAuthor === "true" || ourPublicationAuthor === true;
  const author = await Author.create({
    name,
    bio,
    thumbnail,
    featured: featured === "true" || featured === true,
    ourPublicationAuthor: isPubAuthor,
    order: order !== undefined ? Number(order) : 0
  });

  // Auto-sync into AuthorPortalUser
  try {
    const authorEmail = email || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@lekhoktripura.in`;
    await createOrUpdateAuthorFromForm({
      name,
      email: authorEmail,
      phone: "9876543210",
      planName: "Publication Author Plan"
    });
  } catch (syncErr) {
    console.error("[AuthorSync] Error syncing author to portal:", syncErr);
  }

  res.status(201).json({ success: true, author });
});

/** PUT /api/authors/:id — admin only, update author */
export const updateAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findById(req.params.id);
  if (!author) throw new ApiError(404, "Author not found.");
  const { name, bio, featured, ourPublicationAuthor, order, email } = req.body;
  if (name !== undefined) author.name = name;
  if (bio !== undefined) author.bio = bio;
  if (featured !== undefined) author.featured = featured === "true" || featured === true;
  if (ourPublicationAuthor !== undefined) author.ourPublicationAuthor = ourPublicationAuthor === "true" || ourPublicationAuthor === true;
  if (order !== undefined) author.order = Number(order);
  if (req.file) {
    const thumbnail = await persistUploadedFile(req.file, "authors", "image");
    if (thumbnail) author.thumbnail = thumbnail;
  }
  await author.save();

  // Auto-sync into AuthorPortalUser
  try {
    const authorEmail = email || `${author.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@lekhoktripura.in`;
    await createOrUpdateAuthorFromForm({
      name: author.name,
      email: authorEmail,
      phone: "9876543210",
      planName: "Publication Author Plan"
    });
  } catch (syncErr) {
    console.error("[AuthorSync] Error syncing updated author to portal:", syncErr);
  }

  res.json({ success: true, author });
});

/** DELETE /api/authors/:id — admin only, delete author */
export const deleteAuthor = asyncHandler(async (req, res) => {
  const author = await Author.findByIdAndDelete(req.params.id);
  if (!author) throw new ApiError(404, "Author not found.");

  // Also clean up from AuthorPortalUser so publisher dashboard & author portal stay in sync
  if (author.name) {
    const fallbackEmail = `${author.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@lekhoktripura.in`;
    await AuthorPortalUser.deleteMany({
      $or: [
        { name: new RegExp(`^${author.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        { email: fallbackEmail }
      ]
    });
  }

  res.json({ success: true, message: "Author deleted." });
});

import { AuthorPortalUser } from "../models/AuthorPortalUser.js";
import mongoose from "mongoose";

/** GET /api/authors/:identifier — public, fetch author profile and all associated books */
export const getAuthorProfile = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  if (!identifier) throw new ApiError(400, "Author identifier is required.");

  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  const decoded = decodeURIComponent(identifier).trim();
  const normalizedName = decoded.replace(/[-_]/g, " ").trim();
  const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRegex = new RegExp(`^${escapedName}$`, "i");
  const partialRegex = new RegExp(escapedName, "i");

  // 1. Find Author doc
  let authorDoc = isObjectId
    ? await Author.findById(identifier)
    : await Author.findOne({ $or: [{ name: nameRegex }, { name: partialRegex }] });

  // 2. Find AuthorPortalUser doc if exists
  let portalUser = isObjectId
    ? await AuthorPortalUser.findById(identifier)
    : await AuthorPortalUser.findOne({
        $or: [
          { name: nameRegex },
          { name: partialRegex },
          { authorId: decoded },
          { email: decoded.toLowerCase() }
        ]
      });

  const authorName = authorDoc?.name || portalUser?.name || normalizedName;

  // 3. Find all books associated with this author from Book collection
  const authorNameEscaped = authorName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let finalBooks = await Book.find({
    author: { $regex: new RegExp(`^${authorNameEscaped}$`, "i") }
  }).sort({ featured: -1, createdAt: -1 });

  if (finalBooks.length === 0) {
    finalBooks = await Book.find({
      author: { $regex: new RegExp(authorNameEscaped, "i") }
    }).sort({ featured: -1, createdAt: -1 });
  }

  const result = {
    _id: authorDoc?._id || portalUser?._id,
    name: authorName,
    bio: authorDoc?.bio || portalUser?.planDetails || "Official Author with Lekhok Tripura Publishers.",
    thumbnail: authorDoc?.thumbnail || (portalUser?.thumbnailUrl ? { url: portalUser.thumbnailUrl } : null),
    featured: authorDoc?.featured || false,
    ourPublicationAuthor: authorDoc?.ourPublicationAuthor || Boolean(portalUser),
    selectedPlan: portalUser?.selectedPlan || "Publication Author Plan",
    status: portalUser?.publishingPaymentStatus || "PAID",
    email: portalUser?.email || "",
    phone: portalUser?.phone || "",
    portalBooks: portalUser?.books || [],
    books: finalBooks,
    bookCount: finalBooks.length
  };

  res.json({ success: true, author: result });
});

