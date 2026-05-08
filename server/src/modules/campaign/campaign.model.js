import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: "",
  },
  industry: {
    type: String,
    required: true,
    trim: true,
  },
  platform: [
    {
      type: String,
      enum: ["instagram", "youtube", "tiktok", "twitter", "facebook", "linkedin"],
      required: true,
    }
  ],
  contentTypes: [
    {
      type: String,
      trim: true,
    }
  ],
  deliverables: {
    type: String,
    trim: true,
    default: "",
  },
  targetAudience: {
    type: String,
    trim: true,
    default: "",
  },
  additionalRequirements: {
    type: String,
    trim: true,
    default: "",
  },
  goals: [
    {
      type: String,
      trim: true,
    }
  ],
  competitionLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low',
  },
  budget: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  campaignTimeline: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true }
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Referencing the User model directly as requested (brand userId)
    required: true,
  },
  selectedInfluencer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  status: {
    type: String,
    enum: ['open', 'pending', 'active', 'in_progress', 'review', 'completed', 'paused', 'draft', 'cancelled'],
    default: 'open',
  },
  cancelReason: {
    type: String,
    default: "",
  },
  cancelledAt: {
    type: Date,
    default: null,
  },
  image: {
    type: String,
    default: "",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  // Analytics fields
  reach: {
    type: Number,
    default: 0,
  },
  engagementRate: {
    type: Number,
    default: 0,
  },
  roi: {
    type: Number,
    default: 0,
  },
  impressions: {
    type: Number,
    default: 0,
  },
  likes: {
    type: Number,
    default: 0,
  },
  comments: {
    type: Number,
    default: 0,
  },
  shares: {
    type: Number,
    default: 0,
  }
}, {
  timestamps: true,
});

// Text index on campaign name for search optimization
CampaignSchema.index({ name: 'text' });

// Normal indexes for filtering
CampaignSchema.index({ brand: 1, status: 1 });
// Fixed timeline index
CampaignSchema.index({ "campaignTimeline.startDate": 1, "campaignTimeline.endDate": 1 });

// Optimization Compound Indexes for Heavy Queries
CampaignSchema.index({ brand: 1, isDeleted: 1, createdAt: -1 });
CampaignSchema.index({ status: 1, isDeleted: 1, "campaignTimeline.endDate": 1 });
CampaignSchema.index({ industry: 1 });
CampaignSchema.index({ platform: 1 });

const Campaign = mongoose.model("Campaign", CampaignSchema);

export default Campaign;
