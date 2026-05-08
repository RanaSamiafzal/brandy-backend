import Joi from 'joi';

const fundEscrowSchema = Joi.object({
    collaborationId: Joi.string().required(),
});

const syncEscrowSchema = Joi.object({
    collaborationId: Joi.string().required(),
});

const submitDeliverableSchema = Joi.object({
    submissionFiles: Joi.array().items(Joi.string().uri()).min(1).required(),
});

export const stripeValidation = {
    fundEscrowSchema,
    syncEscrowSchema,
    submitDeliverableSchema,
};
