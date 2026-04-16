import { Router } from "express";
import { messageController } from "./message.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);

router.post("/upload", upload.single("file"), messageController.uploadAttachment);

router.get("/conversations", messageController.getConversations);
router.post("/conversations", messageController.createOrGetConversation);
router.get("/:conversationId", messageController.getMessages);
router.post("/", messageController.sendMessage);
router.put("/:conversationId/read", messageController.markAsRead);

router.put("/:messageId/edit", messageController.editMessage);
router.delete("/bulk-delete", messageController.bulkDeleteForMe);
router.delete("/:messageId/delete-me", messageController.deleteMessageForMe);
router.delete("/:messageId/delete-everyone", messageController.deleteMessageForEveryone);
router.put("/:messageId/react", messageController.reactToMessage);

export default router;
