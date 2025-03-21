import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getSuggestedConnections, getPublicProfile, updateProfile, searchUsers, getUnreadCounts } from "../controllers/user.controller.js";
const router = express.Router();

router.get("/unread-counts", protectRoute, getUnreadCounts);
router.get("/search", protectRoute, searchUsers);
router.get("/recommendations", protectRoute, getSuggestedConnections);
router.get("/suggestions", protectRoute, getSuggestedConnections);
router.get("/:username", protectRoute, getPublicProfile);
router.put("/profile", protectRoute, updateProfile);

export default router;