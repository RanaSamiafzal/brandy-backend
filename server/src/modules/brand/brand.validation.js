import Joi from 'joi';

const updateProfileSchema = Joi.object({
    brandname: Joi.string().trim().min(3).max(100),
    industry: Joi.string().trim(),
    budgetRange: Joi.object({
        min: Joi.number().min(0).required(),
        max: Joi.number().min(Joi.ref('min')).required(),
    }),
    website: Joi.string().uri().allow(''),
    address: Joi.string().trim().allow(''),
    description: Joi.string().trim().max(1000).allow(''),
    lookingFor: Joi.any(),
    lookingForClear: Joi.any(),
    socialMedia: Joi.any(),
    socialMediaUpdate: Joi.any(),
}).unknown(true);

export const brandValidation = {
    updateProfileSchema,
};
