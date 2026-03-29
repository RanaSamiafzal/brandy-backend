import Joi from 'joi';

const campaignCreateSchema = Joi.object({
    name: Joi.string().required().trim().min(3).max(100),
    description: Joi.string().allow('').trim().max(1000),
    industry: Joi.string().trim().when('status', {
        is: 'draft',
        then: Joi.string().optional(),
        otherwise: Joi.string().required()
    }),
    platform: Joi.array().items(
        Joi.string().valid("instagram", "youtube", "tiktok", "twitter", "facebook", "linkedin")
    ).when('status', {
        is: 'draft',
        then: Joi.array().optional(),
        otherwise: Joi.array().min(1).required()
    }),
    budget: Joi.object({
        min: Joi.number().min(0).required(),
        max: Joi.number().min(Joi.ref('min')).required(),
    }).when('status', {
        is: 'draft',
        then: Joi.object().optional(),
        otherwise: Joi.object().required()
    }),
    campaignTimeline: Joi.object({
        startDate: Joi.date().iso().required(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    }).when('status', {
        is: 'draft',
        then: Joi.object().optional(),
        otherwise: Joi.object().required()
    }),
    deliverables: Joi.string().allow('').trim().max(1000),
    targetAudience: Joi.string().allow('').trim().max(1000),
    additionalRequirements: Joi.string().allow('').trim().max(1000),
    image: Joi.string().allow('').uri().optional(),
    status: Joi.string().valid('pending', 'active', 'completed', 'paused', 'draft'),
});

const campaignUpdateSchema = Joi.object({
    name: Joi.string().trim().min(3).max(100),
    description: Joi.string().allow('').trim().max(1000),
    industry: Joi.string().trim(),
    platform: Joi.array().items(
        Joi.string().valid("instagram", "youtube", "tiktok", "twitter", "facebook", "linkedin")
    ),
    budget: Joi.object({
        min: Joi.number().min(0),
        max: Joi.number().min(Joi.ref('min')),
    }),
    campaignTimeline: Joi.object({
        startDate: Joi.date().iso(),
        endDate: Joi.date().iso().min(Joi.ref('startDate')),
    }),
    deliverables: Joi.string().allow('').trim().max(1000),
    targetAudience: Joi.string().allow('').trim().max(1000),
    additionalRequirements: Joi.string().allow('').trim().max(1000),
    image: Joi.string().allow('').uri().optional(),
    status: Joi.string().valid('pending', 'active', 'completed', 'paused', 'draft'),
});

const campaignQuerySchema = Joi.object({
    status: Joi.string().valid('pending', 'active', 'completed', 'paused', 'draft'),
    search: Joi.string().allow('').trim(),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(10),
});

export const campaignValidation = {
    campaignCreateSchema,
    campaignUpdateSchema,
    campaignQuerySchema,
};
