import fs from "fs";
import path from "path";

export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error, _req, res, _next) {
  const statusCode = error.statusCode || 500;
  
  if (statusCode === 500) {
    try {
      const logMessage = `[${new Date().toISOString()}] ERROR: ${error.message}\nStack: ${error.stack}\n\n`;
      fs.appendFileSync(path.resolve("error.log"), logMessage);
    } catch (e) {
      console.error("Failed to write to error.log", e);
    }
  }

  const payload = {
    success: false,
    message: statusCode === 500 ? "Internal server error" : error.message
  };

  if (error.details) payload.details = error.details;
  if (process.env.NODE_ENV !== "production" && statusCode === 500) payload.stack = error.stack;

  res.status(statusCode).json(payload);
}