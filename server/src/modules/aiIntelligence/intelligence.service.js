import User from '../user/user.model.js';
import Campaign from '../campaign/campaign.model.js';
import Collaboration from '../collaboration/collaboration.model.js';
import SupportTicket from '../support/support.model.js';
import AiMemory from '../aiMemory/aiMemory.model.js';
import logger from '../../utils/logger.js';

class IntelligenceService {
    /**
     * Analyze Fraud & Risk Trends
     */
    async analyzeRiskTrends() {
        const highRiskUsers = await AiMemory.countDocuments({ riskLevel: { $in: ['HIGH', 'CRITICAL'] } });
        const recentComplaints = await SupportTicket.countDocuments({ 
            type: 'COMPLAINT', 
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
        });

        return {
            highRiskUsers,
            recentComplaints,
            riskScore: (highRiskUsers * 2) + recentComplaints,
            recommendation: highRiskUsers > 5 ? "Urgent: Review high-risk accounts and pending complaints." : "Risk levels within normal parameters."
        };
    }

    /**
     * Analyze Collaboration Success Patterns
     */
    async analyzeCollaborationSuccess() {
        const total = await Collaboration.countDocuments();
        const completed = await Collaboration.countDocuments({ status: 'completed' });
        const failed = await Collaboration.countDocuments({ status: { $in: ['cancelled', 'disputed'] } });

        const successRate = total > 0 ? (completed / total) * 100 : 0;

        return {
            total,
            completed,
            failed,
            successRate: successRate.toFixed(1) + '%',
            insight: successRate < 70 ? "Collaboration friction detected. Review payout and delivery workflows." : "Healthy collaboration ecosystem."
        };
    }

    /**
     * Generate Platform Intelligence Summary
     */
    async getGlobalIntelligence() {
        const [risk, success] = await Promise.all([
            this.analyzeRiskTrends(),
            this.analyzeCollaborationSuccess()
        ]);

        return {
            timestamp: new Date(),
            summary: `Platform is operating at ${success.successRate} success rate with ${risk.highRiskUsers} high-risk users flagged.`,
            risk,
            success,
            aiAgentRecommendation: risk.riskScore > 20 ? "ALERT: AI Agent suggests manual audit of recent collaborations." : "NORMAL: AI Agent suggests routine maintenance."
        };
    }
}

export const intelligenceService = new IntelligenceService();
