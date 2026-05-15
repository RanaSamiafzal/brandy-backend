import Joi from 'joi';

export const adminValidation = {
    toggleBlockSchema: Joi.object({
        block: Joi.boolean().required().messages({
            'any.required': 'The block status is required',
            'boolean.base': 'Block status must be a boolean'
        }),
        reason: Joi.string().when('block', {
            is: true,
            then: Joi.string().required().min(5).max(500),
            otherwise: Joi.string().allow('').optional()
        }).messages({
            'string.min': 'Blocking reason must be at least 5 characters long',
            'string.max': 'Blocking reason cannot exceed 500 characters',
            'any.required': 'A reason is required when blocking a user'
        })
    })
};
