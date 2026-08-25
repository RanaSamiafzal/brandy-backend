import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        keyHash: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        prefix: {
            type: String,
            required: true,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        scopes: [{
            type: String,
            default: ['aimatch:read', 'campaigns:read', 'influencers:read', 'brands:read'],
        }],
        isActive: {
            type: Boolean,
            default: true,
        },
        expiresAt: {
            type: Date,
        },
        lastUsedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

apiKeySchema.statics.generateKey = function () {
    const secretBytes = crypto.randomBytes(24).toString('hex');
    const rawKey = `brnd_live_${secretBytes}`;
    const prefix = rawKey.substring(0, 14);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    return { rawKey, prefix, keyHash };
};

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
