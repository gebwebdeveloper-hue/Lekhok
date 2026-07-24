import Joi from "joi";

export const emailSchema = Joi.string().email().max(254).required();
export const objectIdSchema = Joi.string().hex().length(24).required();

export const sendOtpSchema = {
  body: Joi.object({ email: emailSchema }).required()
};

export const verifyOtpSchema = {
  body: Joi.object({
    email: emailSchema,
    otp: Joi.string().required(),
    name: Joi.string().trim().max(80).allow(""),
    phone: Joi.string().trim().max(20).allow(""),
    age: Joi.number().integer().min(1).max(120)
  }).required()
};

export const bookCreateSchema = {
  body: Joi.object({
    title: Joi.string().trim().max(180).required(),
    slug: Joi.string().trim().max(220).allow(""),
    author: Joi.string().trim().max(120).required(),
    description: Joi.string().trim().max(6000).required(),
    price: Joi.number().min(0).default(0),
    paperbackPrice: Joi.number().min(0).allow(null, "").default(0),
    hardcoverPrice: Joi.number().min(0).allow(null, "").default(0),
    category: Joi.string().trim().max(80).required(),
    language: Joi.string().trim().max(80).default("English"),
    pages: Joi.number().integer().min(0).default(0),
    tags: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(""),
    featured: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    trending: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    ourPublication: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    comingSoon: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    listenInYoutube: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    youtubeLink: Joi.string().trim().max(500).allow(""),
    publishedAt: Joi.date()
  }).required()
};

export const bookUpdateSchema = {
  params: Joi.object({ id: objectIdSchema }).required(),
  body: Joi.object({
    title: Joi.string().trim().max(180),
    slug: Joi.string().trim().max(220),
    author: Joi.string().trim().max(120),
    description: Joi.string().trim().max(6000),
    price: Joi.number().min(0),
    paperbackPrice: Joi.number().min(0).allow(null, "").default(0),
    hardcoverPrice: Joi.number().min(0).allow(null, "").default(0),
    category: Joi.string().trim().max(80),
    language: Joi.string().trim().max(80),
    pages: Joi.number().integer().min(0),
    tags: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(""),
    featured: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    trending: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    ourPublication: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    comingSoon: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    listenInYoutube: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    youtubeLink: Joi.string().trim().max(500).allow(""),
    publishedAt: Joi.date()
  }).min(1)
};

export const idParamSchema = {
  params: Joi.object({ id: objectIdSchema }).required()
};

export const purchaseCreateSchema = {
  body: Joi.object({
    bookId: objectIdSchema,
    format: Joi.string().valid("ebook", "paperback", "hardcover").default("ebook"),
    transactionNumber: Joi.when("format", {
      is: "ebook",
      then: Joi.string().trim().pattern(/^[0-9]+$/).max(100).required().messages({
        "string.pattern.base": "Transaction number must contain only numbers."
      }),
      otherwise: Joi.string().trim().pattern(/^[0-9]*$/).max(100).allow("")
    }),
    note: Joi.string().trim().max(500).allow(""),
    co: Joi.string().trim().max(120).allow(""),
    country: Joi.string().trim().max(80).default("India"),
    district: Joi.when("format", {
      is: Joi.valid("paperback", "hardcover"),
      then: Joi.string().trim().max(80).required(),
      otherwise: Joi.string().trim().max(80).allow("")
    }),
    block: Joi.when("format", {
      is: Joi.valid("paperback", "hardcover"),
      then: Joi.string().trim().max(80).required(),
      otherwise: Joi.string().trim().max(80).allow("")
    }),
    pin: Joi.when("format", {
      is: Joi.valid("paperback", "hardcover"),
      then: Joi.string().trim().pattern(/^[0-9]+$/).max(10).required(),
      otherwise: Joi.string().trim().pattern(/^[0-9]*$/).max(10).allow("")
    }),
    postOffice: Joi.string().trim().max(80).allow(""),
    nearbyLocation: Joi.when("format", {
      is: Joi.valid("paperback", "hardcover"),
      then: Joi.string().trim().max(200).required(),
      otherwise: Joi.string().trim().max(200).allow("")
    })
  }).required()
};

export const batchPurchaseSchema = {
  body: Joi.object({
    items: Joi.alternatives().try(
      Joi.string(), // if sent as JSON string in FormData
      Joi.array().items(
        Joi.object({
          bookId: objectIdSchema,
          format: Joi.string().valid("ebook", "paperback", "hardcover").default("ebook")
        })
      )
    ).required(),
    transactionNumber: Joi.string().trim().pattern(/^[0-9]+$/).max(100).required().messages({
      "string.pattern.base": "Transaction number must contain only numbers."
    }),
    note: Joi.string().trim().max(500).allow(""),
    co: Joi.string().trim().max(120).allow(""),
    country: Joi.string().trim().max(80).default("India"),
    district: Joi.string().trim().max(80).allow(""),
    block: Joi.string().trim().max(80).allow(""),
    pin: Joi.string().trim().max(10).allow(""),
    postOffice: Joi.string().trim().max(80).allow(""),
    nearbyLocation: Joi.string().trim().max(200).allow("")
  }).required()
};

export const adminNoteSchema = {
  params: Joi.object({ id: objectIdSchema }).required(),
  body: Joi.object({ adminNote: Joi.string().trim().max(500).allow("") }).default({})
};

export const readerBookParamSchema = {
  params: Joi.object({ bookId: objectIdSchema }).required()
};

export const progressSchema = {
  params: Joi.object({ bookId: objectIdSchema }).required(),
  body: Joi.object({
    currentPage: Joi.number().integer().min(1).required(),
    progress: Joi.number().min(0).max(100).required()
  }).required()
};

export const bookmarkSchema = {
  params: Joi.object({ bookId: objectIdSchema }).required(),
  body: Joi.object({
    page: Joi.number().integer().min(1).required(),
    label: Joi.string().trim().max(120).allow(""),
    note: Joi.string().trim().max(500).allow("")
  }).required()
};

export const bookmarkDeleteSchema = {
  params: Joi.object({ bookmarkId: objectIdSchema }).required()
};

const passwordSchema = Joi.string().min(8).max(72).required().messages({
  "string.min": "Password must be at least 8 characters.",
  "string.max": "Password is too long."
});

export const registerSchema = {
  body: Joi.object({
    // Step 1 fields
    email: emailSchema,
    password: passwordSchema,
    otp: Joi.string().length(6).required().messages({ "string.length": "OTP must be 6 digits." }),
    // Profile fields
    name: Joi.string().trim().max(80).required(),
    phone: Joi.string().trim().pattern(/^[0-9]+$/).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    age: Joi.number().integer().min(1).max(120).required()
  }).required()
};

export const loginSchema = {
  body: Joi.object({
    email: emailSchema,
    password: Joi.string().required().messages({ "string.empty": "Password is required." })
  }).required()
};

export const forgotPasswordSchema = {
  body: Joi.object({ email: emailSchema }).required()
};

export const resetPasswordSchema = {
  body: Joi.object({
    email: emailSchema,
    otp: Joi.string().length(6).required(),
    newPassword: passwordSchema
  }).required()
};

export const clubJoinSchema = {
  body: Joi.object({
    fullName: Joi.string().trim().max(120).required(),
    email: emailSchema,
    phone: Joi.string().trim().pattern(/^[0-9]+$/).min(10).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    whatsapp: Joi.string().trim().pattern(/^[0-9]+$/).min(10).max(20).required().messages({
      "string.pattern.base": "WhatsApp number must contain only numbers."
    }),
    dateOfBirth: Joi.date().iso().required(),
    address: Joi.string().trim().max(1000).required(),
    reason: Joi.string().trim().max(1500).required()
  }).required()
};

export const enquirySchema = {
  body: Joi.object({
    fullName: Joi.string().trim().max(120).required(),
    email: emailSchema,
    phone: Joi.string().trim().pattern(/^[0-9]+$/).min(10).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    message: Joi.string().trim().max(3000).required()
  }).required()
};

export const freePublishingSchema = {
  body: Joi.object({
    name: Joi.string().trim().max(120).required(),
    phone: Joi.string().trim().pattern(/^[0-9]+$/).min(8).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    email: emailSchema,
    bookAbout: Joi.string().trim().max(3000).required(),
    manuscriptReady: Joi.string().valid("Yes", "No").required()
  }).required()
};

export const selfPublishingPlanSchema = {
  body: Joi.object({
    planName: Joi.string().trim().max(100).required(),
    name: Joi.string().trim().max(120).required(),
    phone: Joi.string().trim().pattern(/^[0-9]+$/).min(8).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    email: emailSchema,
    address: Joi.string().trim().max(1500).allow(""),
    bookTitle: Joi.string().trim().max(200).allow(""),
    genre: Joi.string().trim().max(100).allow(""),
    pageCount: Joi.string().trim().max(50).allow(""),
    publishingType: Joi.string().trim().max(100).allow(""),
    nominee: Joi.string().trim().max(500).allow(""),
    bookAbout: Joi.string().trim().max(3000).allow(""),
    note: Joi.string().trim().max(1500).allow(""),
    addons: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(null, "")
  }).required()
};

export const newsletterCreateSchema = {
  body: Joi.object({
    title: Joi.string().trim().max(200).required(),
    slug: Joi.string().trim().max(220).allow(""),
    description: Joi.string().trim().max(1000).required(),
    content: Joi.string().required(),
    author: Joi.string().trim().max(120).default("Lekhok Tripura"),
    status: Joi.string().valid("draft", "published").default("draft"),
    publishedAt: Joi.date(),
    fontFamily: Joi.string().trim().max(100).allow("").default("Outfit"),
    price: Joi.number().min(0).default(0),
    categories: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(null, "")
  }).required()
};

export const newsletterUpdateSchema = {
  params: Joi.object({ id: objectIdSchema }).required(),
  body: Joi.object({
    title: Joi.string().trim().max(200),
    slug: Joi.string().trim().max(220),
    description: Joi.string().trim().max(1000),
    content: Joi.string(),
    author: Joi.string().trim().max(120),
    status: Joi.string().valid("draft", "published"),
    publishedAt: Joi.date(),
    fontFamily: Joi.string().trim().max(100).allow(""),
    price: Joi.number().min(0),
    categories: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(null, "")
  }).min(1)
};

export const newsletterAccessRequestSchema = {
  body: Joi.object({
    newsletterId: objectIdSchema,
    userName: Joi.string().trim().max(120).required(),
    userEmail: emailSchema,
    userPhone: Joi.string().trim().pattern(/^[0-9]+$/).min(8).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    transactionId: Joi.string().trim().max(100).required()
  }).required()
};

export const categoryCreateSchema = {
  body: Joi.object({
    name: Joi.string().trim().max(100).required()
  }).required()
};

export const subscribeSchema = {
  body: Joi.object({
    email: emailSchema
  }).required()
};

