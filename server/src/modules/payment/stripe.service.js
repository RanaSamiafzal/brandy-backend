import Stripe from 'stripe';
import { ApiError } from '../../utils/ApiError.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import Collaboration from '../collaboration/collaboration.model.js';
import User from '../user/user.model.js';
import Payment from './payment.model.js';
import mongoose from 'mongoose';
import { sendNotification } from '../../utils/notificationUtils.js';
import { emitActivity } from '../../utils/activityUtils.js';
import Campaign from '../campaign/campaign.model.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Creates a Stripe Connect Account for an Influencer
 */
export const createConnectAccount = async (userId) => {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(validationStatus.notFound, "User not found");

    if (user.stripeAccountId) {
        return user.stripeAccountId;
    }

    const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
            transfers: { requested: true },
        },
    });

    // Use findByIdAndUpdate to avoid triggering full document validation
    // which fails on corrupted verifiedPlatforms data
    await User.findByIdAndUpdate(userId, {
        $set: { stripeAccountId: account.id }
    });

    return account.id;
};


/**
 * Creates an Account Link for Stripe Connect Onboarding
 */
export const createAccountLink = async (accountId) => {
    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.CLIENT_URL}/dashboard/payment/refresh`,
        return_url: `${process.env.CLIENT_URL}/dashboard/payment/success`,
        type: 'account_onboarding',
    });

    return accountLink.url;
};

/**
 * Creates a Stripe PaymentIntent for Brand Escrow Payment
 */
export const createEscrowPaymentIntent = async (collaborationId, brandId) => {
    const collaboration = await Collaboration.findById(collaborationId).populate('campaign');
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== brandId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the assigned brand can fund this escrow");
    }

    if (collaboration.status !== "awaiting_funds") {
        throw new ApiError(validationStatus.badRequest, `Collaboration is in ${collaboration.status} state, not awaiting_funds`);
    }

    if (collaboration.escrowFunded) {
        throw new ApiError(validationStatus.badRequest, `Escrow for this collaboration is already funded`);
    }

    // Ensure brand has a Stripe Customer ID
    let user = await User.findById(brandId);
    if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.fullname,
            metadata: { userId: user._id.toString() }
        });
        await User.findByIdAndUpdate(brandId, { $set: { stripeCustomerId: customer.id } });
        user.stripeCustomerId = customer.id;
    }

    // Budget validation for Stripe (minimum $0.50)
    const amountCents = Math.round(collaboration.agreedBudget * 100);
    if (amountCents < 50) {
        throw new ApiError(validationStatus.badRequest, `The project budget ($${collaboration.agreedBudget}) is below the minimum required for online payment ($0.50). Please update the collaboration budget first.`);
    }

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: collaboration.currency.toLowerCase(),
        customer: user.stripeCustomerId,
        payment_method_types: ['card'],
        metadata: {
            collaborationId: collaboration._id.toString(),
            brandId: brandId.toString(),
            campaignId: collaboration.campaign._id.toString(),
            influencerId: collaboration.influencer.toString(),
            type: 'escrow_funding'
        },
    });

    return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
    };
};

/**
 * Handles Webhook for successful PaymentIntent
 */
export const handlePaymentIntentSucceeded = async (paymentIntent) => {
    const { collaborationId, type } = paymentIntent.metadata;

    if (type !== 'escrow_funding') return;

    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) {
        console.error(`Collaboration ${collaborationId} not found during webhook`);
        return;
    }

    if (collaboration.status === "awaiting_funds" || collaboration.status === "active") {
        collaboration.escrowFunded = true;
        collaboration.stripePaymentIntentId = paymentIntent.id;
        collaboration.status = "active";

        // Automatically create the first task if deliverables are empty
        if (!collaboration.deliverables || collaboration.deliverables.length === 0) {
            const campaign = await Campaign.findById(collaboration.campaign);
            collaboration.deliverables.push({
                title: "Initial Campaign Content",
                platform: (campaign?.platform && campaign.platform.length > 0) ? campaign.platform[0] : "other",
                description: campaign?.deliverables || "Complete the primary content requirements for this campaign.",
                dueDate: campaign?.campaignTimeline?.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days if no end date
                status: "PENDING"
            });
        }

        await collaboration.save();

        // Sync Campaign status
        if (collaboration.campaign) {
            await Campaign.findByIdAndUpdate(collaboration.campaign, { $set: { status: 'active' } });
        }

        // Notify Brand
        await sendNotification({
            user: collaboration.brand,
            type: "escrow_funded",
            title: "Escrow Funded Successfully",
            message: `You have successfully funded the escrow for project: ${collaboration.title}`,
            relatedId: collaboration._id
        });

        // Notify Influencer
        await sendNotification({
            user: collaboration.influencer,
            type: "escrow_funded",
            title: "Project Funded",
            message: `The brand has funded the escrow for your project. You can now start working on: ${collaboration.title}`,
            relatedId: collaboration._id
        });

        // Emit Activity for Real-time UI refresh
        await emitActivity({
            user: collaboration.brand,
            role: 'brand',
            type: 'escrow_funded',
            title: 'Escrow Funded',
            description: `Escrow for "${collaboration.title}" has been funded.`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        await emitActivity({
            user: collaboration.influencer,
            role: 'influencer',
            type: 'escrow_funded',
            title: 'Project Funded',
            description: `The brand has funded the escrow for "${collaboration.title}".`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        console.log(`✅ Escrow funded and notifications sent for collaboration ${collaborationId}`);
    }
};

/**
 * Transfers funds to Influencer for a specific Deliverable
 */
export const transferDeliverablePayout = async (collaborationId, deliverableId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const collaboration = await Collaboration.findById(collaborationId).session(session);
        if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

        if (!collaboration.escrowFunded) {
            throw new ApiError(validationStatus.badRequest, "Cannot release funds: Escrow has not been funded");
        }

        const influencer = await User.findById(collaboration.influencer).session(session);
        if (!influencer || !influencer.stripeAccountId) {
            throw new ApiError(validationStatus.badRequest, "Influencer has not completed Stripe onboarding");
        }

        const deliverable = collaboration.deliverables.id(deliverableId);
        if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

        if (deliverable.status !== "APPROVED") {
            throw new ApiError(validationStatus.badRequest, "Only approved deliverables can be paid");
        }

        if (deliverable.paymentStatus === "paid") {
            throw new ApiError(validationStatus.badRequest, "Deliverable has already been paid");
        }

        // Payout amount logic: release allocated budget OR remaining balance if final
        let payoutAmountCents = 0;
        if (deliverable.isFinal) {
            // Release EVERYTHING remaining in escrow
            const remainingBudget = Math.max(0, collaboration.agreedBudget - collaboration.totalPaidAmount);
            payoutAmountCents = Math.floor(remainingBudget * 100);
        } else {
            // Release specifically the allocated budget for this task
            payoutAmountCents = Math.floor(deliverable.allocatedBudget * 100);

            // Safety guard: ensure we don't accidentally overpay beyond agreed budget
            const potentialTotal = (collaboration.totalPaidAmount || 0) + (payoutAmountCents / 100);
            if (potentialTotal > collaboration.agreedBudget) {
                throw new ApiError(validationStatus.badRequest, `Payout exceeds total collaboration budget! Only $${collaboration.agreedBudget - collaboration.totalPaidAmount} remains in escrow.`);
            }
        }

        if (payoutAmountCents <= 0) {
            throw new ApiError(validationStatus.badRequest, "No funds remaining to release for this task");
        }

        // Idempotency Key prevents duplicate transfers
        const idempotencyKey = `transfer_${collaborationId}_${deliverableId}`;

        const transfer = await stripe.transfers.create({
            amount: payoutAmountCents,
            currency: collaboration.currency.toLowerCase(),
            destination: influencer.stripeAccountId,
            description: `Payout for ${deliverable.title} (${deliverable.isFinal ? 'FINAL' : 'PARTIAL'})`,
            metadata: {
                collaborationId: collaborationId.toString(),
                deliverableId: deliverableId.toString(),
                isFinal: deliverable.isFinal.toString()
            }
        }, {
            idempotencyKey
        });

        deliverable.paymentStatus = "paid";
        deliverable.stripeTransferId = transfer.id;
        deliverable.approvedAt = new Date();

        // Update total paid amount on collaboration (with precision rounding)
        const newPaidAmount = (collaboration.totalPaidAmount || 0) + (payoutAmountCents / 100);
        collaboration.totalPaidAmount = Math.round(newPaidAmount * 100) / 100;

        // Create Payment record for history
        await Payment.create([{
            collaboration: collaborationId,
            deliverable: deliverableId,
            campaign: collaboration.campaign,
            brand: collaboration.brand,
            influencer: collaboration.influencer,
            amount: payoutAmountCents / 100,
            currency: collaboration.currency,
            netAmount: payoutAmountCents / 100,
            status: 'completed',
            stripeTransferId: transfer.id,
            stripePaymentIntentId: collaboration.stripePaymentIntentId,
            completion: {
                completedAt: new Date(),
                stripeResponse: transfer
            }
        }], { session });

        await collaboration.save({ session });
        await session.commitTransaction();

        // Notify Brand (outside transaction for reliability)
        sendNotification({
            user: collaboration.brand,
            type: "deliverable_approved",
            title: "Task Approved & Paid",
            message: `You approved and paid for the task: ${deliverable.title}`,
            relatedId: collaboration._id
        });

        // Notify Influencer
        sendNotification({
            user: collaboration.influencer,
            type: "payout_released",
            title: "Payment Received",
            message: `You have received a payment of $${(payoutAmountCents / 100).toFixed(2)} for task: ${deliverable.title}`,
            relatedId: collaboration._id
        });

        return transfer;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Card Management Logic
 */
export const listPaymentMethods = async (userId) => {
    const user = await User.findById(userId);
    if (!user?.stripeCustomerId) return [];

    const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card',
    });

    return paymentMethods.data;
};

export const createSetupIntent = async (userId) => {
    let user = await User.findById(userId);
    if (!user.stripeCustomerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.fullname,
            metadata: { userId: user._id.toString() }
        });
        await User.findByIdAndUpdate(userId, { $set: { stripeCustomerId: customer.id } });
        user.stripeCustomerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
        customer: user.stripeCustomerId,
        payment_method_types: ['card'],
    });

    return setupIntent;
};

export const detachPaymentMethod = async (paymentMethodId) => {
    return await stripe.paymentMethods.detach(paymentMethodId);
};

export const getPaymentHistory = async (userId, role) => {
    const query = role === 'brand' ? { brand: userId } : { influencer: userId };
    return await Payment.find(query)
        .populate('collaboration', 'title')
        .populate('campaign', 'name')
        .populate('brand', 'fullname profilePic')
        .populate('influencer', 'fullname profilePic')
        .sort({ createdAt: -1 })
        .lean();
};

export const stripeService = {
    createConnectAccount,
    createAccountLink,
    createEscrowPaymentIntent,
    handlePaymentIntentSucceeded,
    transferDeliverablePayout,
    listPaymentMethods,
    createSetupIntent,
    detachPaymentMethod,
    getPaymentHistory
};
