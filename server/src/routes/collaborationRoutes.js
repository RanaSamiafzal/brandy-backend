import { Router } from "express";
import {
    getCollaborations,
    getCollaborationDetails,
    cancelCollaboration,
    completeCollaboration,
    createDeliverable,
    getDeliverables,
    updateDeliverable,
    deleteDeliverable,
    submitDeliverable,
    approveDeliverable,
    requestRevision,
} from "../controllers/collaborationController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = Router();

// all collaboration routes require authentication
router.use(verifyJwt);

// ─────────────────────────────────────────────
// Collaboration CRUD
// ─────────────────────────────────────────────

// GET  /collaborations          → both roles
// ─────────────────────────────────────────────
router.route("/")
    .get(getCollaborations);

// GET  /collaborations/:id      → both roles
// PATCH /collaborations/:id/cancel → both roles
// ─────────────────────────────────────────────
router.route("/:id")
    .get(getCollaborationDetails);

router.route("/:id/cancel")
    .patch(cancelCollaboration);

// PATCH /collaborations/:id/complete → brand only
router.route("/:id/complete")
    .patch(roleMiddleware("brand"), completeCollaboration);


// ─────────────────────────────────────────────
// Deliverable Management
// ─────────────────────────────────────────────

// POST  /collaborations/:id/deliverables  → brand only (creates task)
// GET   /collaborations/:id/deliverables  → both roles
router.route("/:id/deliverables")
    .post(roleMiddleware("brand"), createDeliverable)
    .get(getDeliverables);

// PATCH  /collaborations/:id/deliverables/:deliverableId → influencer only (update details)
// DELETE /collaborations/:id/deliverables/:deliverableId → brand only
router.route("/:id/deliverables/:deliverableId")
    .patch(roleMiddleware("influencer"), updateDeliverable)
    .delete(roleMiddleware("brand"), deleteDeliverable);


// ─────────────────────────────────────────────
// Submission & Review Endpoints
// ─────────────────────────────────────────────

// POST  /collaborations/:id/deliverables/:deliverableId/submit   → influencer only
router.route("/:id/deliverables/:deliverableId/submit")
    .post(roleMiddleware("influencer"), submitDeliverable);

// PATCH /collaborations/:id/deliverables/:deliverableId/approve  → brand only
router.route("/:id/deliverables/:deliverableId/approve")
    .patch(roleMiddleware("brand"), approveDeliverable);

// PATCH /collaborations/:id/deliverables/:deliverableId/revision → brand only
router.route("/:id/deliverables/:deliverableId/revision")
    .patch(roleMiddleware("brand"), requestRevision);


export default router;
