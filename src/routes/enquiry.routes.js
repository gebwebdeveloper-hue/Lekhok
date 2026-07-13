import { Router } from "express";
import { sendEnquiryEmail } from "../services/mail.service.js";
import { validate } from "../middlewares/validate.middleware.js";
import { enquirySchema } from "../utils/validators.js";

const router = Router();

router.post("/", validate(enquirySchema), async (req, res, next) => {
  try {
    let adminEmailSent = false;
    try {
      await sendEnquiryEmail(req.body);
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about general enquiry:", error);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});

export default router;
