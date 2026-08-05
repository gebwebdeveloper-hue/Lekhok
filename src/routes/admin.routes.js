import { Router } from "express";
import { getDashboardAnalytics, listUsers, revokeUserPurchase, deleteUser } from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireRole("admin"));
router.get("/analytics", getDashboardAnalytics);
router.get("/users", listUsers);
router.patch("/users/purchases/:purchaseId/revoke", revokeUserPurchase);
router.delete("/users/:userId", deleteUser);

export default router;