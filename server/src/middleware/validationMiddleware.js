import { ApiError } from '../utils/ApiError.js';
import { validationStatus } from '../utils/ValidationStatusCode.js';

/**
 * Middleware to validate request data against a Joi schema
 * @param {Object} schema - Joi schema object 
 * @param {string} source - Request source (body, query, params)
 */
export const validate = (schema, source = 'body') => (req, res, next) => {
    // If it's a multipart form with nested fields (like budget[min]), unflatten it
    if (source === 'body' && req[source]) {
        const unflattened = {};
        Object.keys(req[source]).forEach(key => {
            const nestedMatch = key.match(/^([^\[]+)\[([^\]]+)\]$/);
            if (nestedMatch) {
                const [_, parent, child] = nestedMatch;
                if (!unflattened[parent]) unflattened[parent] = {};
                unflattened[parent][child] = req[source][key];
            } else {
                unflattened[key] = req[source][key];
            }
        });
        req[source] = unflattened;
    }

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

    // Safely update request data with validated value without reassigning the whole object
    // This fixes "Cannot set property query of #<IncomingMessage> which has only a getter"
    Object.keys(req[source]).forEach(key => delete req[source][key]);
    Object.assign(req[source], value);

    next();
};
