import { stripeService } from "./stripe.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { ApiError } from "../../utils/ApiError.js";
import Collaboration from "../collaboration/collaboration.model.js";
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
    deliverable.status = "SUBMITTED";
    deliverable.submittedAt = new Date();
    deliverable.submissionFiles = submissionFiles || [];
    
    await collaboration.save();

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
    
    if (deliverable.status !== "SUBMITTED") {
        throw new ApiError(validationStatus.badRequest, "Only submitted deliverables can be approved");
    }

    // Mark as approved in model first
    deliverable.status = "APPROVED";
    deliverable.approvedAt = new Date();
    await collaboration.save();

    // Trigger Stripe Transfer
    await stripeService.transferDeliverablePayout(collaboration._id, deliverableId);

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
    await stripeService.detachPaymentMethod(paymentMethodId);
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
