import { Router } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../middlewares/error.middleware.js";
import {
  publisherLogin,
  authorLogin,
  getPublisherOverview,
  getAuthorMyStats,
  createAuthorByAdmin,
  addSaleTransaction,
  updateAuthorWorkflow,
  updateAuthorFullExecutionDetails,
  requestReprint
} from "../controllers/publisher.controller.js";

const router = Router();

function authenticatePortalToken(req, res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.[env.cookieName] || bearer;
    if (!token) throw new ApiError(401, "Authentication token missing.");

    const decoded = jwt.verify(token, env.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    next(new ApiError(401, "Invalid or expired session. Please log in again."));
  }
}

// Public Auth routes
router.post("/login", publisherLogin);
router.post("/author-login", authorLogin);

// Publisher Protected routes
router.get("/overview", authenticatePortalToken, getPublisherOverview);
router.post("/authors", authenticatePortalToken, createAuthorByAdmin);
router.patch("/authors/:id/workflow", authenticatePortalToken, updateAuthorWorkflow);
router.patch("/authors/:id/full-workflow", authenticatePortalToken, updateAuthorFullExecutionDetails);
router.post("/sales", authenticatePortalToken, addSaleTransaction);

// Author Protected routes
router.get("/author/my-stats", authenticatePortalToken, getAuthorMyStats);
router.post("/author/reprint", authenticatePortalToken, requestReprint);

export default router;
