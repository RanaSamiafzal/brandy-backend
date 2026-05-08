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

const deliverableSchema = Joi.object({
    title: Joi.string().required(),
    platform: Joi.string().valid("instagram", "youtube", "tiktok", "twitter", "linkedin", "facebook", "other").required(),
    description: Joi.string().allow(''),
    dueDate: Joi.date().required(),
    allocatedBudget: Joi.number().min(0).required(),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH").default("MEDIUM"),
    isFinal: Joi.boolean().default(false),
});

const actionRequestSchema = Joi.object({
    type: Joi.string().valid("CANCEL", "COMPLETE", "ADD_TASKS").required(),
    reason: Joi.string().trim().min(5).required(),
    proposedTasks: Joi.array().items(deliverableSchema).optional()
});

const handleActionSchema = Joi.object({
    action: Joi.string().valid("APPROVE", "REJECT").required(),
    note: Joi.string().trim().max(500).allow(''),
    reviewData: Joi.object({
        rating: Joi.number().min(1).max(5),
        comment: Joi.string().trim().max(1000).allow('')
    }).optional()
});

const updateDeliverableSchema = Joi.object({
    title: Joi.string().optional(),
    platform: Joi.string().valid("instagram", "youtube", "tiktok", "twitter", "linkedin", "facebook", "other").optional(),
    description: Joi.string().allow('').optional(),
    dueDate: Joi.date().optional(),
    allocatedBudget: Joi.number().min(0).optional(),
    priority: Joi.string().valid("LOW", "MEDIUM", "HIGH").optional(),
    isFinal: Joi.boolean().optional(),
    status: Joi.string().valid("PENDING", "IN_PROGRESS", "IN_REVIEW", "REVISION_REQUESTED", "APPROVED").optional(),
});

const submitDeliverableSchema = Joi.object({
    submissionFiles: Joi.array().items(Joi.string().trim().min(5)).min(1).required(),
});

const reviewDeliverableSchema = Joi.object({
    status: Joi.string().valid("APPROVED", "REVISION_REQUESTED").required(),
    revisionNotes: Joi.string().when('status', {
        is: 'REVISION_REQUESTED',
        then: Joi.string().required(),
        otherwise: Joi.string().allow('')
    }),
});

const influencerReviewSchema = Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    comment: Joi.string().trim().max(1000).allow(''),
});

const reasonSchema = Joi.object({
    reason: Joi.string().trim().min(5).required(),
});

export const collaborationValidation = {
    sendRequestSchema,
    requestQuerySchema,
    counterOfferSchema,
    actionRequestSchema,
    handleActionSchema,
    deliverableSchema,
    updateDeliverableSchema,
    submitDeliverableSchema,
    reviewDeliverableSchema,
    influencerReviewSchema,
    reasonSchema
};
