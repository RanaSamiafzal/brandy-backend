import mongoose, { Schema } from 'mongoose';

const paymentSchema = new Schema({
    // Identifiers
    collaboration: {
        type: Schema.Types.ObjectId,
        ref: 'Collaboration',
        required: true,
        index: true
    },
    deliverable: {
        type: Schema.Types.ObjectId  // Reference to deliverable in collaboration
    },
    campaign: {
        type: Schema.Types.ObjectId,
        ref: 'Campaign',
        required: true
    },
    brand: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    influencer: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Amount Information
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    currency: {
        type: String,
        default: 'PKR',
        enum: ['PKR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD']
    },
    
    // Platform Fees
    platformFee: {
        type: Number,
        default: 0  // 5% typically
    },
    platformFeePercentage: {
        type: Number,
        default: 5
    },
    netAmount: {
        // amount - platformFee
        type: Number,
        required: true
    },
    
    // Payment Status Lifecycle
    status: {
        type: String,
        enum: [
            'pending',              // Not yet requested
            'requested',            // Influencer requested payment
            'pending_approval',     // Waiting for brand approval
            'approved',             // Brand approved
            'processing',           // Stripe processing
            'completed',            // Successfully transferred
            'failed',              // Stripe transfer failed
            'refunded',            // Payment refunded to brand
            'disputed',            // Disputed by influencer or brand
            'cancelled'            // Cancelled before completion
        ],
        default: 'pending',
        index: true
    },
    
    // Stripe References
    stripePaymentIntentId: {
        type: String,              // Initial charge to brand
        index: true
    },
    stripeTransferId: {
        type: String,              // Transfer to influencer
        index: true
    },
    stripeRefundId: {
        type: String              // If refunded
    },
    
    // Request Information
    paymentRequest: {
        requestedAt: Date,
        requestedBy: {
            type: String,
            enum: ['influencer', 'brand']
        },
        requestMessage: String
    },
    
    // Approval Information
    approval: {
        approvedAt: Date,
        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        approvalNotes: String
    },
    
    // Completion Information
    completion: {
        completedAt: Date,
        stripeResponse: Schema.Types.Mixed  // Full Stripe response
    },
    
    // Failure/Refund Information
    failure: {
        failedAt: Date,
        stripeError: String,
        reason: String,
        retryCount: {
            type: Number,
            default: 0
        },
        nextRetry: Date
    },
    
    refund: {
        refundedAt: Date,
        refundReason: String,
        refundedAmount: Number,
        refundStripeId: String
    },
    
    // Dispute Information
    dispute: {
        raisedAt: Date,
        raisedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,
        evidence: [String],        // File URLs
        status: String,            // 'open', 'resolved', 'cancelled'
        resolution: String
    },
    
    // Timeline
    // Audit
    auditLog: [{
        action: String,
        timestamp: Date,
        actor: {
            userId: Schema.Types.ObjectId,
            role: String
        },
        details: Schema.Types.Mixed
    }]
}, { timestamps: true });

// Indexes for fast queries
paymentSchema.index({ collaboration: 1, deliverable: 1 }); // Removed unique constraint to allow refunds without deliverables
paymentSchema.index({ brand: 1, status: 1 });
paymentSchema.index({ influencer: 1, status: 1 });
paymentSchema.index({ campaign: 1, status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;