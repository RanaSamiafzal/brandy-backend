import ModerationLog from "./moderation.model.js";
import { memoryService } from "../aiMemory/memory.service.js";
import { memoryRepository } from "../aiMemory/memory.repository.js";
import User from "../user/user.model.js";
import eventBus from "../../events/eventBus.js";
import { EVENTS } from "../../events/constants.js";
import logger from "../../utils/logger.js";

class ModerationService {
    /**
     * Adjust Trust Score & Log Action
     */
    async adjustTrust(userId, type, reason, trustChange, adminId = null) {
        logger.info(`Moderation: ${type} for user ${userId}. Reason: ${reason}. Change: ${trustChange}`);

        // 1. Fetch AI Memory
        const memory = await memoryService.getUserContext(userId);
        
        // 2. Calculate New Score
        const oldScore = memory.trustScore || 50;
        const newScore = Math.max(0, Math.min(100, oldScore + trustChange));

        // 3. Determine Risk Level
        let riskLevel = "LOW";
        if (newScore < 20) riskLevel = "CRITICAL";
        else if (newScore < 40) riskLevel = "HIGH";
        else if (newScore < 60) riskLevel = "MEDIUM";

        // 4. Update Memory
        await memoryRepository.update(userId, { 
            trustScore: newScore,
            riskLevel 
        });

        // 5. Log Moderation Action
        const log = await ModerationLog.create({
            userId,
            adminId,
            type,
            reason,
            trustChange,
            status: adminId ? "APPROVED" : "AUTO_RESOLVED"
        });

        // 6. Emit Security Alert if Critical
        if (riskLevel === "CRITICAL") {
            eventBus.emit(EVENTS.SYSTEM.SECURITY_ALERT, {
                userId,
                type: "CRITICAL_RISK_DETECTED",
                reason: `Trust score dropped to ${newScore} after ${type}`
            });
        }

        return { log, newScore, riskLevel };
    }

    /**
     * Fraud Detection Hook (Simulated logic)
     */
    async detectFraud(userId, activityData) {
        // Mock: If user has 3+ IP switches in an hour or suspicious payout patterns
        const isSuspicious = activityData.ipSwitches > 5;
        
        if (isSuspicious) {
            await this.adjustTrust(userId, "FRAUD_ALERT", "Multiple IP anomalies detected", -30);
            eventBus.emit(EVENTS.SYSTEM.SECURITY_ALERT, {
                userId,
                type: "FRAUD_SUSPICION",
                details: activityData
            });
        }
    }

    /**
     * Get Moderation History for User
     */
    async getHistory(userId) {
        return await ModerationLog.find({ userId }).sort({ createdAt: -1 });
    }
}

export const moderationService = new ModerationService();
