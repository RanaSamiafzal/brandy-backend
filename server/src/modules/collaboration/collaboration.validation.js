import Joi from 'joi';

const sendRequestSchema = Joi.object({
    receiverId: Joi.string().required(),
    campaignId: Joi.string().optional(),
    proposedBudget: Joi.number().min(0).allow(null),
    note: Joi.string().trim().max(1000).allow(''),
    deliveryDays: Joi.number().min(1).allow(null).optional(),
});

const requestQuerySchema = Joi.object({
    status: Joi.string().valid("requested", "rejected", "awaiting_onboarding", "awaiting_funds", "active", "completed", "cancelled", "pending", "accepted"),
    type: Joi.string().valid("sent", "received", "all"),
    search: Joi.string().allow(''),
    platform: Joi.string().allow(''),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(10),
});

const counterOfferSchema = Joi.object({
    newBudget: Joi.number().min(0.5).required(), // Enforce Stripe minimum
    note: Joi.string().trim().max(1000).allow(''),
});

export const collaborationValidation = {
    sendRequestSchema,
    requestQuerySchema,
    counterOfferSchema,
};
