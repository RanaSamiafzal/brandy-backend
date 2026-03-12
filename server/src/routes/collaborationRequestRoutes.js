import { Router } from "express";
import {
    sendCollaborationRequest,
    getCollaborationRequests,
    getRequestDetails,
    acceptRequest,
    rejectRequest,
    cancelRequest
} from "../controllers/collaborationRequestController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.route("/")
    .get(getCollaborationRequests)
    .post(sendCollaborationRequest);

router.route("/:requestId")
    .get(getRequestDetails);

router.route("/:requestId/accept").patch(acceptRequest);
router.route("/:requestId/reject").patch(rejectRequest);
router.route("/:requestId/cancel").patch(cancelRequest);

export default router;
