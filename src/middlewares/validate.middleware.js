import Joi from "joi";
import fs from "fs";
import { ApiError } from "./error.middleware.js";

export function validate(schema) {
  return (req, _res, next) => {
    const data = {
      body: req.body,
      params: req.params,
      query: req.query
    };

    const { error, value } = Joi.object(schema).validate(data, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: { objects: true }
    });

    if (error) {
      // Clean up any files uploaded by multer
      if (req.files) {
        Object.values(req.files).flat().forEach((file) => {
          fs.unlink(file.path, () => {});
        });
      }
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }

      const details = error.details.map((item) => ({ path: item.path.join("."), message: item.message }));
      return next(new ApiError(422, "Validation failed", details));
    }

    req.body = value.body || req.body;
    req.params = value.params || req.params;
    req.query = value.query || req.query;
    next();
  };
}