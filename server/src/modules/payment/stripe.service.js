import Stripe from 'stripe';
import { ApiError } from '../../utils/ApiError.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import Collaboration from '../collaboration/collaboration.model.js';
import User from '../user/user.model.js';
import Payment from './payment.model.js';
import mongoose from 'mongoose';
import { socketManager } from '../../config/socketManager.js';
import { sendNotification } from '../../utils/notificationUtils.js';
import { emitActivity } from '../../utils/activityUtils.js';
import Campaign from '../campaign/campaign.model.js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
 * Manually sync the escrow status of a collaboration with Stripe.
 * Useful if webhooks are delayed or failing.
 */
export const syncEscrowStatus = async (collaborationId) => {
    const collaboration = await Collaboration.findById(collaborationId).populate('campaign');
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.escrowFunded) {
        return { alreadyFunded: true, status: collaboration.status };
    }

    if (!collaboration.stripePaymentIntentId) {
        return { alreadyFunded: false, needsPayment: true };
    }

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(collaboration.stripePaymentIntentId);
        
        if (paymentIntent.status === 'succeeded') {
            // Update collaboration to active/funded
            collaboration.escrowFunded = true;
            collaboration.totalFundedAmount = collaboration.agreedBudget;
            collaboration.status = "active";
            
            await collaboration.save();

            // Sync Campaign status
            if (collaboration.campaign) {
                await Campaign.findByIdAndUpdate(collaboration.campaign, { $set: { status: 'active' } });
            }

            return { alreadyFunded: true, status: "active", updated: true };
        }

        return { 
            alreadyFunded: false, 
            status: paymentIntent.status,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        };
    } catch (err) {
        console.error("Sync Escrow Status Error:", err.message);
        return { alreadyFunded: false, error: err.message };
    }
};

/**
 * Creates a Stripe PaymentIntent for Brand Escrow Payment
 * Enhanced: Reuses existing PaymentIntents and saves ID to DB immediately to prevent double charges.
 */
export const createEscrowPaymentIntent = async (collaborationId, brandId) => {
    const collaboration = await Collaboration.findById(collaborationId).populate('campaign');
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== brandId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the assigned brand can fund this escrow");
    }

    if (collaboration.status !== "awaiting_funds" && collaboration.status !== "active") {
        throw new ApiError(validationStatus.badRequest, `Collaboration is in ${collaboration.status} state, not awaiting_funds`);
    }

    if (!collaboration.brandAgreed || !collaboration.influencerAgreed) {
        throw new ApiError(validationStatus.badRequest, "Agreement must be signed by both parties before funding escrow");
    }

    // Check if already funded
    if (collaboration.escrowFunded) {
        throw new ApiError(validationStatus.badRequest, `Escrow for this collaboration is already funded`);
    }

    // --- REUSE LOGIC ---
    // If we already have a PaymentIntent ID, check its status on Stripe
    // IMPORTANT: Only reuse if the amount matches!
    const amountToCharge = collaboration.agreedBudget - (collaboration.totalFundedAmount || 0);
    const amountCents = Math.round(amountToCharge * 100);

    if (collaboration.stripePaymentIntentId) {
        const syncResult = await syncEscrowStatus(collaborationId);
        
        if (syncResult.alreadyFunded) {
            return {
                alreadyFunded: true,
                message: "This project has already been funded."
            };
        }

        // If we have a PaymentIntent, retrieve it to check the amount
        try {
            const existingIntent = await stripe.paymentIntents.retrieve(collaboration.stripePaymentIntentId);
            if (existingIntent.amount === amountCents && !['succeeded', 'canceled'].includes(existingIntent.status)) {
                return {
                    clientSecret: existingIntent.client_secret,
                    paymentIntentId: existingIntent.id
                };
            }
        } catch (err) {
            console.warn("Failed to retrieve existing PaymentIntent, will create new one:", err.message);
        }
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

    // Auto-fix: If agreedBudget is 0 but proposedBudget or campaign budget exists, use it
    if (!collaboration.agreedBudget || collaboration.agreedBudget === 0) {
        const fallbackBudget = collaboration.proposedBudget || collaboration.campaign?.budget?.min || 0;
        if (fallbackBudget > 0) {
            collaboration.agreedBudget = fallbackBudget;
            await collaboration.save();
        }
    }

    // Budget validation for Stripe (minimum $0.50)
    // Only charge the DIFFERENCE between agreed and already funded
    if (amountCents < 50) {
        throw new ApiError(validationStatus.badRequest, `The additional funding amount ($${amountToCharge.toFixed(2)}) is below the minimum required for online payment ($0.50). Please update the collaboration budget first.`);
    }

    // Clear old PaymentIntent ID if it's no longer valid (different amount or status)
    if (collaboration.stripePaymentIntentId) {
        collaboration.stripePaymentIntentId = null;
        // Don't save yet, we'll save with the new ID below
    }

    // Create a PaymentIntent with Idempotency Key
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
            type: 'escrow_funding',
            fundingRound: `${(collaboration.totalFundedAmount || 0)}_to_${collaboration.agreedBudget}`
        },
    }, {
        idempotencyKey: `escrow_fund_${collaborationId}_${amountCents}`
    });

    // CRITICAL: Save the PaymentIntent ID to the collaboration record IMMEDIATELY
    // This allows the self-healing sync to work even if the webhook fails.
    await Collaboration.findByIdAndUpdate(collaborationId, {
        $set: { stripePaymentIntentId: paymentIntent.id }
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
        collaboration.totalFundedAmount = collaboration.agreedBudget;
        collaboration.stripePaymentIntentId = paymentIntent.id;
        collaboration.status = "active";

        // Record in funding history
        collaboration.fundingHistory.push({
            amount: paymentIntent.amount / 100,
            paymentIntentId: paymentIntent.id,
            fundedAt: new Date()
        });

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

        // Real-time sync for dashboard
        const collabData = { collaborationId: collaboration._id, status: collaboration.status, escrowFunded: true };
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "collaboration_updated", collabData);
        
        // Also emit payment event
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "payment_received", { type: 'escrow_funded', amount: paymentIntent.amount / 100 });
    }
};

/**
 * Handles Webhook for Connect Account Updates
 */
export const handleAccountUpdated = async (account) => {
    if (account.details_submitted) {
        // Find user by stripeAccountId and mark onboarding as complete
        await User.findOneAndUpdate(
            { stripeAccountId: account.id },
            { $set: { stripeOnboardingComplete: true } }
        );
        console.log(`✅ Onboarding complete for Stripe Account: ${account.id}`);
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

        if (deliverable.status !== "SUBMITTED" && deliverable.status !== "APPROVED") {
            throw new ApiError(validationStatus.badRequest, "Only submitted or already approved deliverables can be paid");
        }

        // Atomically mark as approved if it was only submitted
        if (deliverable.status === "SUBMITTED") {
            deliverable.status = "APPROVED";
            deliverable.approvedAt = new Date();
        }

        if (deliverable.paymentStatus === "paid") {
            throw new ApiError(validationStatus.badRequest, "Deliverable has already been paid");
        }

        // Payout amount logic: release allocated budget
        // If this is the FINAL task, release the entire remaining escrow balance
        let payoutAmountCents;
        const remainingEscrow = Math.max(0, collaboration.agreedBudget - (collaboration.totalPaidAmount || 0));

        if (deliverable.isFinal) {
            payoutAmountCents = Math.round(remainingEscrow * 100);
        } else {
            payoutAmountCents = Math.round(deliverable.allocatedBudget * 100);
            
            // Safety guard: ensure we don't accidentally overpay beyond agreed budget
            if ((payoutAmountCents / 100) > remainingEscrow) {
                // Adjust to remaining escrow if it's a rounding issue (e.g., 1 cent off)
                if (Math.abs((payoutAmountCents / 100) - remainingEscrow) <= 0.01) {
                    payoutAmountCents = Math.round(remainingEscrow * 100);
                } else {
                    throw new ApiError(validationStatus.badRequest, `Payout ($${deliverable.allocatedBudget}) exceeds remaining escrow budget ($${remainingEscrow.toFixed(2)}).`);
                }
            }
        }

        if (payoutAmountCents <= 0) {
            // If this is a zero-sum final task (all money already paid), just mark it as paid and return
            console.log(`ℹ️ Zero-sum payout for deliverable ${deliverableId}. Marking as paid without Stripe call.`);
            deliverable.paymentStatus = "paid";
            deliverable.approvedAt = new Date();
            await collaboration.save({ session });
            await session.commitTransaction();
            
            const delivData = { collaborationId: collaboration._id, deliverableId, status: "APPROVED", paymentStatus: "paid" };
            socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "deliverable_updated", delivData);
            
            return { message: "Zero-sum payout completed" };
        }

        // Idempotency Key prevents duplicate transfers - Specific to deliverable
        const idempotencyKey = `deliverable_payout_${deliverableId}`;

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
        await sendNotification({
            user: collaboration.influencer,
            type: "payout_released",
            title: "Payment Received",
            message: `You have received a payment of $${(payoutAmountCents / 100).toFixed(2)} for task: ${deliverable.title}`,
            relatedId: collaboration._id
        });

        await emitActivity({
            user: collaboration.influencer,
            role: 'influencer',
            type: 'payout_released',
            title: 'Payment Received',
            description: `A payout of $${(payoutAmountCents / 100).toFixed(2)} was sent to your Stripe account.`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        // Real-time sync
        const delivData = { collaborationId: collaboration._id, deliverableId, status: "APPROVED", paymentStatus: "paid" };
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "deliverable_updated", delivData);
        
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "payment_released", { collaborationId, deliverableId, amount: payoutAmountCents / 100 });

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

export const detachPaymentMethod = async (paymentMethodId, userId) => {
    const user = await User.findById(userId);
    if (!user?.stripeCustomerId) throw new ApiError(validationStatus.notFound, "Customer not found");

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== user.stripeCustomerId) {
        throw new ApiError(validationStatus.forbidden, "Access denied: You do not own this payment method");
    }

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

/**
 * Refunds the remaining escrow balance back to the brand
 */
export const refundCollaborationBalance = async (collaborationId) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) {
        throw new ApiError(validationStatus.notFound, "Collaboration not found");
    }

    if (!collaboration.escrowFunded) return { refundedAmount: 0, message: "Escrow not funded" };

    const remainingAmount = Math.max(0, collaboration.agreedBudget - collaboration.totalPaidAmount);
    if (remainingAmount <= 0) return { refundedAmount: 0, message: "No balance to refund" };

    console.log(`🔄 Initiating Waterfall Refund for $${remainingAmount} (Collab: ${collaborationId})`);
    
    let amountLeftToRefund = remainingAmount;
    let totalRefunded = 0;
    const refundsIssued = [];

    // Sort funding history by newest first to refund the most recent money first
    const sortedHistory = [...collaboration.fundingHistory].sort((a, b) => b.fundedAt - a.fundedAt);

    for (const payment of sortedHistory) {
        if (amountLeftToRefund <= 0) break;

        try {
            // Check how much of THIS specific PI is already refunded
            const existingRefunds = await stripe.refunds.list({ payment_intent: payment.paymentIntentId });
            const alreadyRefundedOnThisPI = existingRefunds.data.reduce((sum, r) => sum + r.amount, 0) / 100;
            const availableToRefundOnThisPI = payment.amount - alreadyRefundedOnThisPI;

            if (availableToRefundOnThisPI <= 0) continue;

            const refundAmount = Math.min(amountLeftToRefund, availableToRefundOnThisPI);
            const amountCents = Math.round(refundAmount * 100);

            if (amountCents < 50) continue; // Stripe minimum refund is usually $0.50 for some accounts, or just avoid tiny dust

            const refund = await stripe.refunds.create({
                payment_intent: payment.paymentIntentId,
                amount: amountCents,
                reason: 'requested_by_customer',
                metadata: {
                    collaborationId: collaborationId.toString(),
                    type: 'waterfall_refund'
                }
            });

            collaboration.refundHistory.push({
                amount: refundAmount,
                refundId: refund.id,
                createdAt: new Date()
            });

            refundsIssued.push(refund.id);
            totalRefunded += refundAmount;
            amountLeftToRefund -= refundAmount;

            // Create Payment record for history
            await Payment.create({
                collaboration: collaborationId,
                brand: collaboration.brand,
                influencer: collaboration.influencer,
                campaign: collaboration.campaign,
                amount: refundAmount,
                netAmount: refundAmount,
                currency: collaboration.currency,
                status: 'refunded',
                stripeTransferId: refund.id,
                description: `Waterfall refund of remaining balance ($${refundAmount.toFixed(2)})`
            });

        } catch (err) {
            console.error(`❌ Refund failed for PI ${payment.paymentIntentId}:`, err.message);
        }
    }

    await collaboration.save();
    return { 
        refundedAmount: Math.round(totalRefunded * 100) / 100, 
        refundsIssued,
        remainingUnprocessed: Math.round(amountLeftToRefund * 100) / 100
    };
};

export const stripeService = {
    createConnectAccount,
    createAccountLink,
    createEscrowPaymentIntent,
    handlePaymentIntentSucceeded,
    handleAccountUpdated,
    syncEscrowStatus,
    transferDeliverablePayout,
    refundCollaborationBalance,
    listPaymentMethods,
    createSetupIntent,
    detachPaymentMethod,
    getPaymentHistory
};
