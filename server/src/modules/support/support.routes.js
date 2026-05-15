import { Router } from "express";
import { supportController } from "./support.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";

const router = Router();

// All support routes require authentication
router.use(verifyJwt);

// User Routes
router.post("/tickets", supportController.createTicket);
router.get("/my-tickets", supportController.getMyTickets);
router.get("/tickets/:ticketId", supportController.getTicketDetails);

// Admin Routes
router.get("/admin/all-tickets", roleMiddleware(["admin"]), supportController.getAllTickets);

export default router;
