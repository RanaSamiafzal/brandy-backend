import { Router } from "express";
import { collaborationController } from "./collaboration.controller.js";
import { collaborationValidation } from "./collaboration.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.route("/request")
    .post(validate(collaborationValidation.sendRequestSchema), collaborationController.sendCollaborationRequest)
    .get(validate(collaborationValidation.requestQuerySchema, "query"), collaborationController.getCollaborationRequests);

router.post("/request/:requestId/accept", collaborationController.acceptCollaborationRequest);
router.post("/request/:requestId/reject", collaborationController.rejectCollaborationRequest);
router.post("/request/:requestId/cancel", collaborationController.cancelCollaborationRequest);

router.route("/")
    .get(collaborationController.getCollaborations);

router.route("/:id")
    .get(collaborationController.getCollaborationDetails);

router.route("/:id/cancel")
    .patch(collaborationController.cancelCollaboration);

router.route("/:id/complete")
    .patch(collaborationController.completeCollaboration);

// Deliverables management
router.route("/:id/deliverables")
    .post(collaborationController.addDeliverable);

router.route("/:id/deliverables/:deliverableId")
    .patch(collaborationController.updateDeliverable)
    .delete(collaborationController.deleteDeliverable);

router.post("/:id/deliverables/:deliverableId/submit", collaborationController.submitDeliverable);
router.patch("/:id/deliverables/:deliverableId/review", collaborationController.reviewDeliverable);

export default router;

