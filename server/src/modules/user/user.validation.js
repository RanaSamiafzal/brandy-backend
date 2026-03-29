import Joi from 'joi';

const updateProfileSchema = Joi.object({
    fullname: Joi.string().trim().min(3).max(50),
    profilePic: Joi.string().uri().allow(''),
    coverPic: Joi.string().uri().allow(''),
});

export const userValidation = {
    updateProfileSchema,
};
