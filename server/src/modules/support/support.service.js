import { supportRepository } from "./support.repository.js";
import { memoryService } from "../aiMemory/memory.service.js";
import eventBus from "../../events/eventBus.js";
import { EVENTS } from "../../events/constants.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import crypto from "crypto";
import logger from "../../utils/logger.js";

class SupportService {
    /**
     * Create a new support ticket
     */
    async createTicket(userId, ticketData) {
        const { type, subject, description, relatedEntityId } = ticketData;

        // 1. Duplicate Prevention (1 hour window for same type)
        const existing = await supportRepository.checkDuplicate(userId, type);
        if (existing) {
            throw new ApiError(validationStatus.badRequest, `You already have an open ticket for ${type}. Please wait or update the existing ticket.`);
        }

        // 2. Generate Unique Ticket ID
        const ticketId = `TKT-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

        // 3. AI Enrichment (Initial Context)
        const userContext = await memoryService.getUserContext(userId);
        const aiSummary = `User Trust: ${userContext.trustScore}%, Risk: ${userContext.riskLevel}. Subject analysis needed.`;

        // 4. Persistence
        const ticket = await supportRepository.create({
            ticketId,
            userId,
            type,
            subject,
            description,
            relatedEntityId,
            aiSummary,
            status: "OPEN",
            priority: type === "COMPLAINT" ? "HIGH" : "MEDIUM"
        });

        // 5. Side Effects & Notifications
        logger.info(`Support Ticket Created: ${ticketId} [${type}]`);
        
        // Notify Admin via EventBus
        eventBus.emit(EVENTS.SYSTEM.AUDIT_LOG, {
            userId,
            action: "SUPPORT_TICKET_CREATED",
            details: `New ${type} ticket: ${ticketId} - ${subject}`
        });

        // If it's a complaint, update AI memory immediately
        if (type === "COMPLAINT") {
            await memoryService.recordEvent(userId, "complaints", {
                reason: subject,
                timestamp: new Date()
            });
        }

        // Real-time Update via Socket
        const { socketManager } = await import("../../config/socketManager.js");
        socketManager.emitToUser(userId, "TICKET_CREATED", {
            ticketId,
            status: "OPEN",
            title: subject
        });

        return ticket;
    }

    /**
     * Resolve a ticket
     */
    async resolveTicket(ticketId, adminId) {
        const ticket = await supportRepository.updateStatus(ticketId, "RESOLVED");
        if (!ticket) throw new ApiError(validationStatus.notFound, "Ticket not found");

        await supportRepository.addMessage(ticketId, adminId, "This ticket has been marked as resolved by the support team.");
        
        // Real-time Update via Socket
        const { socketManager } = await import("../../config/socketManager.js");
        socketManager.emitToUser(ticket.userId, "TICKET_RESOLVED", {
            ticketId,
            status: "RESOLVED"
        });

        return ticket;
    }

    /**
     * AI Hook: Agent can use this to suggest resolutions
     */
    async updateAiSuggestions(ticketId, suggestion) {
        return await SupportTicket.findOneAndUpdate(
            { ticketId },
            { $set: { aiSuggestedResolution: suggestion, aiAssisted: true } },
            { new: true }
        );
    }
}

export const supportService = new SupportService();
