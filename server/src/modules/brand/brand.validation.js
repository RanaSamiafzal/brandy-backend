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
    geo: Joi.alternatives().try(
        Joi.string().allow(''),
        Joi.object({
            lat: Joi.number().min(-90).max(90),
            lng: Joi.number().min(-180).max(180),
            city: Joi.string().allow(''),
            country: Joi.string().allow(''),
            formatted: Joi.string().allow(''),
        })
    ),
    description: Joi.string().trim().max(1000).allow(''),
    lookingFor: Joi.any(),
    lookingForClear: Joi.any(),
    socialMedia: Joi.any(),
    socialMediaUpdate: Joi.any(),
}).unknown(true);

export const brandValidation = {
    updateProfileSchema,
};
