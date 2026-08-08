import { Router } from "express";
import { getProfile, updateProfile, activateMembership } from "../controllers/profile.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, getProfile);
router.put("/", requireAuth, updateProfile);
router.post("/activate-membership", requireAuth, activateMembership);

export default router;