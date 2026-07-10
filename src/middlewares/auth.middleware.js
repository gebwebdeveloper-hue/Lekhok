import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "./error.middleware.js";
import { verifyAuthToken } from "../utils/jwt.js";

export async function requireAuth(req, _res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.[env.cookieName] || bearer;
    if (!token) throw new ApiError(401, "Authentication required.");

    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, "Invalid session.");

    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, "Invalid or expired session."));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Authentication required."));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, "You do not have permission to perform this action."));
    next();
  };
}