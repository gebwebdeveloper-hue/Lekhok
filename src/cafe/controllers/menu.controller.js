import { CafeMenuItem } from "../models/CafeMenuItem.js";
import { persistUploadedFile } from "../../services/storage.service.js";

const DEFAULT_CAFE_ITEMS = [
  {
    name: "Signature Espresso",
    description: "Rich, bold, aromatic double espresso shot brewed from premium dark roasted Arabica beans.",
    price: 80,
    category: "coffee",
    imageUrl: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 5,
    tags: ["bestseller", "espresso", "hot"],
  },
  {
    name: "Cold Coffee with Ice Cream",
    description: "Refreshing, creamy blended cold coffee topped with rich vanilla ice cream and chocolate drizzle.",
    price: 120,
    category: "coffee",
    imageUrl: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 8,
    tags: ["bestseller", "cold", "iced"],
  },
  {
    name: "Masala Chai",
    description: "Classic Indian spiced tea with fresh ginger, cardamom, and aromatic spices.",
    price: 50,
    category: "tea",
    imageUrl: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 5,
    tags: ["traditional", "hot", "tea"],
  },
  {
    name: "Fresh Mango Smoothie",
    description: "Fresh Alphonso mangoes blended with chilled thick yogurt and honey.",
    price: 130,
    category: "cold-drinks",
    imageUrl: "https://images.unsplash.com/photo-1546173159-315724a31696?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 6,
    tags: ["fresh", "fruit", "smoothie"],
  },
  {
    name: "Club Sandwich",
    description: "Triple-layer toasted sandwich filled with fresh lettuce, tomatoes, cheese, and spicy mayo.",
    price: 150,
    category: "snacks",
    imageUrl: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 12,
    tags: ["sandwich", "crispy", "snack"],
  },
  {
    name: "Brownie Delight",
    description: "Warm fudgy chocolate brownie served with a scoop of vanilla ice cream and hot fudge.",
    price: 140,
    category: "desserts",
    imageUrl: "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80",
    available: true,
    featured: true,
    preparationTime: 10,
    tags: ["chocolate", "dessert", "sweet"],
  },
];

async function seedIfEmpty() {
  try {
    const count = await CafeMenuItem.countDocuments();
    if (count === 0) {
      console.log("[MongoDB Cafe] Database is empty. Seeding default menu items...");
      await CafeMenuItem.insertMany(DEFAULT_CAFE_ITEMS);
    }
  } catch (err) {
    console.error("[MongoDB Cafe] Auto-seed failed:", err.message);
  }
}

// GET /api/cafe/menu  — public
export async function getMenu(req, res, next) {
  try {
    await seedIfEmpty();
    const { category } = req.query;
    const filter = { available: true };
    if (category && category !== "all") filter.category = category;

    const items = await CafeMenuItem.find(filter).sort({ featured: -1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
}

// GET /api/cafe/menu/featured  — public
export async function getFeaturedMenu(req, res, next) {
  try {
    await seedIfEmpty();
    const { category } = req.query;
    const filter = { available: true };
    if (category && category !== "all") filter.category = category;

    // First try items marked as featured
    let items = await CafeMenuItem.find({ ...filter, featured: true })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    // If no featured items exist, fall back to any available menu items
    if (!items || items.length === 0) {
      items = await CafeMenuItem.find(filter)
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();
    }

    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
}

// GET /api/cafe/menu/all  — admin only (includes unavailable items)
export async function getAllMenuItems(req, res, next) {
  try {
    await seedIfEmpty();
    const { category } = req.query;
    const filter = {};
    if (category && category !== "all") filter.category = category;
    const items = await CafeMenuItem.find(filter).sort({ featured: -1, category: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
}

// POST /api/cafe/menu/upload-image  — admin only
export async function uploadMenuImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file uploaded." });
    }

    // Max size check: 2MB (2 * 1024 * 1024 bytes)
    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "Image size must be 2MB or smaller." });
    }

    // Format check: PNG, JPG, JPEG, WEBP
    const allowedMime = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedMime.includes(req.file.mimetype.toLowerCase())) {
      return res.status(400).json({ success: false, message: "Invalid image format. Allowed formats: PNG, JPG, JPEG, WEBP." });
    }

    const uploaded = await persistUploadedFile(req.file, "cafe-menu", "image");

    let finalUrl = uploaded.url;
    if (finalUrl.startsWith("/")) {
      const protocol = req.protocol || "http";
      const host = req.get("host") || "localhost:5000";
      finalUrl = `${protocol}://${host}${finalUrl}`;
    }

    res.json({ success: true, url: finalUrl, storage: uploaded.storage });
  } catch (err) {
    next(err);
  }
}

// POST /api/cafe/menu  — admin only (seed / create)
export async function createMenuItem(req, res, next) {
  try {
    const item = await CafeMenuItem.create(req.body);
    res.status(201).json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/cafe/menu/:id  — admin only
export async function updateMenuItem(req, res, next) {
  try {
    const item = await CafeMenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/cafe/menu/:id  — admin only
export async function deleteMenuItem(req, res, next) {
  try {
    await CafeMenuItem.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    next(err);
  }
}
