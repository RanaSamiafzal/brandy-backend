import Joi from 'joi';

const updateProfileSchema = Joi.object({
    fullname: Joi.string().trim().min(2).max(100),
    profilePic: Joi.string().uri().allow(''),
    coverPic: Joi.string().uri().allow(''),
});

export const userValidation = {
    updateProfileSchema,
};
