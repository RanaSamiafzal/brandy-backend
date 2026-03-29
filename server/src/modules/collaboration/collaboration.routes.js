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

export default router;
