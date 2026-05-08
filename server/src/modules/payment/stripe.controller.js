import { stripeService, stripe } from "./stripe.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { ApiError } from "../../utils/ApiError.js";
import Collaboration from "../collaboration/collaboration.model.js";
import { emitActivity } from "../../utils/activityUtils.js";

/**
 * Brand: Fund the escrow for a collaboration
 */
const fundEscrow = AsyncHandler(async (req, res) => {
    const { collaborationId } = req.body;
    if (!collaborationId) throw new ApiError(validationStatus.badRequest, "collaborationId is required");

    const { clientSecret, paymentIntentId } = await stripeService.createEscrowPaymentIntent(collaborationId, req.user._id);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { clientSecret, paymentIntentId }, "Escrow PaymentIntent created")
    );
});

/**
 * Brand: Manually sync escrow status if webhook is delayed
 */
const syncEscrowStatus = AsyncHandler(async (req, res) => {
    const { collaborationId } = req.body;
    if (!collaborationId) throw new ApiError(validationStatus.badRequest, "collaborationId is required");

    const result = await stripeService.syncEscrowStatus(collaborationId);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Escrow status synced")
    );
});

/**
 * Influencer: Start a deliverable (Set to IN_PROGRESS)
 */
const startDeliverable = AsyncHandler(async (req, res) => {
    const { id: deliverableId } = req.params;

    const collaboration = await Collaboration.findOne({
        "deliverables._id": deliverableId,
        influencer: req.user._id
    });

    if (!collaboration) throw new ApiError(validationStatus.notFound, "Deliverable not found or access denied");
    
    if (!collaboration.escrowFunded) {
        throw new ApiError(validationStatus.forbidden, "Escrow must be funded before starting task");
    }

    if (!req.user.stripeAccountId) {
        throw new ApiError(validationStatus.forbidden, "Please connect your Stripe account before starting the task");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (deliverable.status !== "PENDING") {
        throw new ApiError(validationStatus.badRequest, `Task is already ${deliverable.status}`);
    }

    deliverable.status = "IN_PROGRESS";
    deliverable.inProgressAt = new Date();
    await collaboration.save();

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Task marked as In Progress")
    );
});

/**
 * Influencer: Submit a deliverable (Set to SUBMITTED)
 */
const submitDeliverable = AsyncHandler(async (req, res) => {
    const { id: deliverableId } = req.params;
    const { submissionFiles } = req.body;

    const collaboration = await Collaboration.findOne({
        "deliverables._id": deliverableId,
        influencer: req.user._id
    });

    if (!collaboration) throw new ApiError(validationStatus.notFound, "Deliverable not found or access denied");
    
    if (!collaboration.escrowFunded) {
        throw new ApiError(validationStatus.forbidden, "Escrow must be funded before submission");
    }

    if (!req.user.stripeAccountId) {
        throw new ApiError(validationStatus.forbidden, "Please connect your Stripe account before submitting the task");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");
    
    // Safety check: Only IN_PROGRESS or REVISION_REQUESTED tasks can be submitted
    if (deliverable.status !== "IN_PROGRESS" && deliverable.status !== "REVISION_REQUESTED") {
        throw new ApiError(validationStatus.badRequest, `Only in-progress tasks can be submitted. Current status: ${deliverable.status}`);
    }

    deliverable.status = "SUBMITTED";
    deliverable.submittedAt = new Date();
    deliverable.submissionFiles = submissionFiles || [];
    
    await collaboration.save();

    // Notify brand about submission
    await emitActivity({
        user: collaboration.brand,
        role: "brand",
        type: "deliverable_submitted",
        title: "Deliverable Submitted",
        description: `The influencer has submitted work for: ${deliverable.title}`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Deliverable submitted for review")
    );
});

/**
 * Brand: Approve a deliverable and trigger payment
 */
const approveDeliverable = AsyncHandler(async (req, res) => {
    const { id: deliverableId } = req.params;

    const collaboration = await Collaboration.findOne({
        "deliverables._id": deliverableId,
        brand: req.user._id
    });

    if (!collaboration) throw new ApiError(validationStatus.notFound, "Deliverable not found or access denied");

    const deliverable = collaboration.deliverables.id(deliverableId);
    
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    // Trigger Atomic Stripe Transfer and Status Update
    await stripeService.transferDeliverablePayout(collaboration._id, deliverableId);

    // Notify influencer about approval (payment notification is handled in service)
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "deliverable_approved",
        title: "Deliverable Approved",
        description: `Your work for "${deliverable.title}" was approved by the brand.`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, "Deliverable approved and payment released")
    );
});

/**
 * Influencer: Connect Onboarding
 */
const onboardConnect = AsyncHandler(async (req, res) => {
    const accountId = await stripeService.createConnectAccount(req.user._id);
    const url = await stripeService.createAccountLink(accountId);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { url }, "Stripe Connect onboarding link created")
    );
});

/**
 * Brand: Card Management
 */
const getPaymentMethods = AsyncHandler(async (req, res) => {
    const methods = await stripeService.listPaymentMethods(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, methods, "Payment methods retrieved")
    );
});

const createSetupIntent = AsyncHandler(async (req, res) => {
    const setupIntent = await stripeService.createSetupIntent(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { clientSecret: setupIntent.client_secret }, "SetupIntent created")
    );
});

const removePaymentMethod = AsyncHandler(async (req, res) => {
    const { id: paymentMethodId } = req.params;

    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== req.user.stripeCustomerId) {
        throw new ApiError(403, "You don't own this payment method");
    }

    await stripeService.detachPaymentMethod(paymentMethodId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, "Payment method removed")
    );
});

/**
 * Global: Payment History
 */
const getPaymentHistory = AsyncHandler(async (req, res) => {
    const history = await stripeService.getPaymentHistory(req.user._id, req.user.role);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, history, "Payment history retrieved")
    );
});

/**
 * System: Stripe Webhook
 */
const stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body, // Raw Buffer
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("❌ Webhook Signature failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        switch (event.type) {
            case "payment_intent.succeeded":
                await stripeService.handlePaymentIntentSucceeded(event.data.object);
                break;
            case "account.updated":
                await stripeService.handleAccountUpdated(event.data.object);
                break;
            case "checkout.session.completed":
                // Legacy support if needed, but we use PaymentIntents now
                break;
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Webhook handler failed:", error);
        res.status(500).send("Internal Server Error");
    }
};

export const stripeController = {
    fundEscrow,
    syncEscrowStatus,
    startDeliverable,
    submitDeliverable,
    approveDeliverable,
    onboardConnect,
    getPaymentMethods,
    createSetupIntent,
    removePaymentMethod,
    getPaymentHistory,
    stripeWebhook
};
