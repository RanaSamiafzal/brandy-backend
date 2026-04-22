import Joi from 'joi';

const updateProfileSchema = Joi.object({
    about: Joi.string().trim().min(10).max(1000),
    username: Joi.string().trim().min(3).max(50),
    category: Joi.string().trim(),
    platforms: Joi.array().items(Joi.object({
        name: Joi.string().required(),
        username: Joi.string().allow(''),
        followers: Joi.number().min(0),
        profileUrl: Joi.string().uri().allow(''),
        influenceRate: Joi.number().min(1).max(10),
        services: Joi.array().items(Joi.object({
            contentType: Joi.string().required(),
            price: Joi.number().min(0).required(),
            description: Joi.string().allow(''),
        })),
    })),
    portfolio: Joi.string().uri().allow(''),
    resume: Joi.any().allow(''),
    recentWork: Joi.any(),
    location: Joi.string().trim().allow(''),
    isAvailable: Joi.boolean(),
    socialMedia: Joi.any(),
    socialMediaUpdate: Joi.any(),
}).unknown(true);

const searchQuerySchema = Joi.object({
    search: Joi.string().allow('').trim(),
    category: Joi.string().trim(),
    platform: Joi.string().trim(),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    minFollowers: Joi.number().min(0),
    rating: Joi.number().min(0).max(5),
    location: Joi.string().allow('').trim(),
    page: Joi.number().min(1).default(1),
    limit: Joi.number().min(1).max(100).default(10),
    sort: Joi.string().valid("latest", "rating_desc").default("latest"),
});

export const influencerValidation = {
    updateProfileSchema,
    searchQuerySchema,
};
