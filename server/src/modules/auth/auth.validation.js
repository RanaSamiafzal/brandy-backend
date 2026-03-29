import Joi from 'joi';

const registerSchema = Joi.object({
    fullname: Joi.string().required().trim().min(3).max(50),
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().required().min(6),
    role: Joi.string().valid("brand", "influencer", "admin").required(),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().required(),
});

const refreshSchema = Joi.object({
    refreshToken: Joi.string().optional(),
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
});

const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    otp: Joi.string().required().length(6),
    password: Joi.string().required().min(6),
});

export const authValidation = {
    registerSchema,
    loginSchema,
    refreshSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
};
