import { Router } from "express";
import { getDashboardAnalytics, listUsers } from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/analytics", getDashboardAnalytics);
router.get("/users", listUsers);

export default router;