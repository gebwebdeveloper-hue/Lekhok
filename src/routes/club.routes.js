import { Router } from "express";
import { sendClubApplicationEmail } from "../services/mail.service.js";
import { validate } from "../middlewares/validate.middleware.js";
import { clubJoinSchema } from "../utils/validators.js";

const router = Router();

router.post("/join", validate(clubJoinSchema), async (req, res, next) => {
  try {
    let adminEmailSent = false;
    try {
      await sendClubApplicationEmail(req.body);
      adminEmailSent = true;
    } catch (error) {
      console.error("[Email] Failed to notify admin about club application:", error);
    }

    res.status(201).json({ success: true, adminEmailSent });
  } catch (error) {
    next(error);
  }
});

export default router;
