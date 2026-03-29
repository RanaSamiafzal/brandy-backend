import Joi from 'joi';

const sendRequestSchema = Joi.object({
    receiverId: Joi.string().required(),
    campaignId: Joi.string().optional(),
    proposedBudget: Joi.number().min(0).allow(null),
    note: Joi.string().trim().max(1000).allow(''),
    deliveryDays: Joi.string().required(),
});

const requestQuerySchema = Joi.object({
    status: Joi.string().valid("pending", "accepted", "rejected", "cancelled"),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(10),
});

export const collaborationValidation = {
    sendRequestSchema,
    requestQuerySchema,
};
