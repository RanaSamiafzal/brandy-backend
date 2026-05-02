// File: server/src/modules/payment/escrow.model.js 
// Tracks total campaign budget)

import mongoose from "mongoose";

const { Schema } = mongoose;

const escrowSchema = new Schema({
    campaign: {
        type: Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true,
        unique: true
    },
    brand: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Budget Information
    totalBudget: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'USD'
    },
    
    // Budget Breakdown
    budgetBreakdown: {
        totalAmount: Number,
        numberOfTasks: Number,
        amountPerTask: Number,
        platformFeePercentage: Number,
        estimatedPlatformFees: Number
    },
    
    // Escrow Status
    status: {
        type: String,
        enum: [
            'not_initiated',        // Campaign created, no escrow yet
            'payment_method_pending', // Waiting for brand to add payment method
            'escrow_held',          // Funds held in Stripe
            'partially_released',   // Some funds released to influencers
            'fully_released',       // All funds released
            'refunded'             // Brand cancelled, funds refunded
        ],
        default: 'not_initiated'
    },
    
    // Stripe Account Information
    stripePaymentIntentId: {
        type: String,
        index: true
    },
    stripeBrandAccountId: {
        type: String
    },
    
    // Escrow Timeline
    initiated: {
        at: Date,
        by: Schema.Types.ObjectId
    },
    
    charged: {
        at: Date,
        amount: Number,
        stripeResponse: Schema.Types.Mixed
    },
    
    // Release Tracking
    totalReleased: {
        type: Number,
        default: 0
    },
    releases: [{
        releaseId: Schema.Types.ObjectId,  // Payment ID
        amount: Number,
        influencerId: Schema.Types.ObjectId,
        releasedAt: Date
    }],
    
    // Refund Information
    refund: {
        initiatedAt: Date,
        reason: String,
        refundedAmount: Number,
        stripeRefundId: String,
        completedAt: Date
    },
    
    // Dispute Information
    disputes: [{
        paymentId: Schema.Types.ObjectId,
        openedAt: Date,
        closedAt: Date,
        reason: String,
        resolution: String
    }],
    
    timestamps: true
});

escrowSchema.index({ campaign: 1 });
escrowSchema.index({ brand: 1, status: 1 });

const Escrow = mongoose.model('Escrow', escrowSchema);