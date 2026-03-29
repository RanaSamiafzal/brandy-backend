import { ApiError } from '../utils/ApiError.js';
import { validationStatus } from '../utils/ValidationStatusCode.js';

/**
 * Middleware to validate request data against a Joi schema
 * @param {Object} schema - Joi schema object 
 * @param {string} source - Request source (body, query, params)
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        const errorMessage = error.details
            .map((detail) => detail.message)
            .join(', ');
        return next(new ApiError(validationStatus.badRequest, errorMessage));
    }

    // Replace request data with validated value
    req[source] = value;
    next();
};
