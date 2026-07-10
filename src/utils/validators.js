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
    co: Joi.string().trim().max(120).allow(""),
    phone: Joi.string().trim().max(20).allow(""),
    country: Joi.string().trim().max(80).allow(""),
    district: Joi.string().trim().max(80).allow(""),
    block: Joi.string().trim().max(80).allow(""),
    pin: Joi.string().trim().max(10).allow(""),
    postOffice: Joi.string().trim().max(80).allow(""),
    nearbyLocation: Joi.string().trim().max(200).allow("")
  }).required()
};

export const bookCreateSchema = {
  body: Joi.object({
    title: Joi.string().trim().max(180).required(),
    slug: Joi.string().trim().max(220).allow(""),
    author: Joi.string().trim().max(120).required(),
    description: Joi.string().trim().max(6000).required(),
    price: Joi.number().min(0).required(),
    category: Joi.string().trim().max(80).required(),
    language: Joi.string().trim().max(80).default("English"),
    pages: Joi.number().integer().min(1).required(),
    tags: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(""),
    featured: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    trending: Joi.alternatives().try(Joi.boolean(), Joi.string()),
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
    category: Joi.string().trim().max(80),
    language: Joi.string().trim().max(80),
    pages: Joi.number().integer().min(1),
    tags: Joi.alternatives().try(Joi.string().allow(""), Joi.array().items(Joi.string())).allow(""),
    featured: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    trending: Joi.alternatives().try(Joi.boolean(), Joi.string()),
    publishedAt: Joi.date()
  }).min(1)
};

export const idParamSchema = {
  params: Joi.object({ id: objectIdSchema }).required()
};

export const purchaseCreateSchema = {
  body: Joi.object({
    bookId: objectIdSchema,
    transactionNumber: Joi.string().trim().pattern(/^[0-9]+$/).max(100).required().messages({
      "string.pattern.base": "Transaction number must contain only numbers."
    }),
    note: Joi.string().trim().max(500).allow("")
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
    co: Joi.string().trim().max(120).allow(""),
    phone: Joi.string().trim().pattern(/^[0-9]+$/).max(20).required().messages({
      "string.pattern.base": "Phone number must contain only numbers."
    }),
    country: Joi.string().trim().max(80).default("India"),
    district: Joi.string().trim().max(80).allow(""),
    block: Joi.string().trim().max(80).allow(""),
    pin: Joi.string().trim().max(10).allow(""),
    postOffice: Joi.string().trim().max(80).allow(""),
    nearbyLocation: Joi.string().trim().max(200).allow("")
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