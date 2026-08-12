import { CafeCategory } from "../models/CafeCategory.js";

// Default fallback headings when admin hasn't configured a category yet
const DEFAULTS = {
  coffee:       { title: "COFFEE COLLECTION",       subtitle: "RICH AROMA. PERFECT BREW. PURE INDULGENCE." },
  tea:          { title: "TEA & HERBAL INFUSIONS",   subtitle: "NATURAL WELLNESS. CALMING BREWS. MINDFUL SIPS." },
  "cold-drinks":{ title: "COLD DRINKS & REFRESHERS", subtitle: "CHILLED. REFRESHING. ENERGIZING." },
  snacks:       { title: "SNACKS & BITES",           subtitle: "CRISPY. FRESH. PERFECTLY CRAFTED." },
  meals:        { title: "WHOLESOME MEALS",          subtitle: "NOURISHING. HEARTY. SATISFYING." },
  desserts:     { title: "DESSERTS & SWEETS",        subtitle: "INDULGENT. HANDMADE. HEAVENLY." },
  others:       { title: "SPECIALTY ITEMS",          subtitle: "UNIQUE PICKS FROM OUR KITCHEN." },
};

// GET /api/cafe/categories — public, returns all category configs
export async function getCategories(req, res, next) {
  try {
    const docs = await CafeCategory.find().sort({ sortOrder: 1 }).lean();
    // Merge with defaults so every category is always represented
    const CATEGORY_IDS = ["coffee", "tea", "cold-drinks", "snacks", "meals", "desserts", "others"];
    const map = {};
    docs.forEach((d) => { map[d.categoryId] = d; });

    const result = CATEGORY_IDS.map((id, i) => ({
      categoryId: id,
      title:    map[id]?.title    || DEFAULTS[id]?.title    || id.toUpperCase(),
      subtitle: map[id]?.subtitle || DEFAULTS[id]?.subtitle || "",
      sortOrder: map[id]?.sortOrder ?? i,
      _id: map[id]?._id || null,
    }));

    res.json({ success: true, categories: result });
  } catch (err) {
    next(err);
  }
}

// PUT /api/cafe/categories/:categoryId — admin only, upsert a category config
export async function upsertCategory(req, res, next) {
  try {
    const { categoryId } = req.params;
    const { title, subtitle, sortOrder } = req.body;

    const doc = await CafeCategory.findOneAndUpdate(
      { categoryId },
      { title: title?.trim() || "", subtitle: subtitle?.trim() || "", sortOrder: sortOrder ?? 99 },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, category: doc });
  } catch (err) {
    next(err);
  }
}
