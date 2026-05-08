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
router.post("/request/:requestId/counter-offer", validate(collaborationValidation.counterOfferSchema), collaborationController.counterOffer);

router.route("/")
    .get(collaborationController.getCollaborations);

router.route("/latest/:otherUserId")
    .get(collaborationController.getLatestCollaborationWithUser);

router.route("/:id")
    .get(collaborationController.getCollaborationDetails);

router.route("/:id/cancel")
    .patch(validate(collaborationValidation.reasonSchema), collaborationController.cancelCollaboration);

router.route("/:id/complete")
    .patch(collaborationController.completeCollaboration);

router.route("/:id/suspend")
    .patch(collaborationController.suspendCollaboration);

router.route("/:id/request-action")
    .post(validate(collaborationValidation.actionRequestSchema), collaborationController.submitActionRequest);

router.route("/:id/handle-action")
    .post(validate(collaborationValidation.handleActionSchema), collaborationController.handleActionRequest);

// Deliverables management
router.route("/:id/deliverables")
    .post(validate(collaborationValidation.deliverableSchema), collaborationController.addDeliverable);

router.route("/:id/deliverables/:deliverableId")
    .patch(validate(collaborationValidation.updateDeliverableSchema), collaborationController.updateDeliverable)
    .delete(collaborationController.deleteDeliverable);

router.post("/:id/deliverables/:deliverableId/submit", validate(collaborationValidation.submitDeliverableSchema), collaborationController.submitDeliverable);
router.patch("/:id/deliverables/:deliverableId/review", validate(collaborationValidation.reviewDeliverableSchema), collaborationController.reviewDeliverable);

// Influencer reviews brand (post-completion)
router.post("/:id/influencer-review", validate(collaborationValidation.influencerReviewSchema), collaborationController.submitInfluencerReview);

// Agreement confirmation
router.post("/:id/confirm-agreement", collaborationController.confirmAgreement);

export default router;

