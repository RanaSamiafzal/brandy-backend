import mongoose from "mongoose";

const CampaignSchema = new mongoose.Schema({
  // brand who create campaign
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },

  description: {
    type: String,
    default: "",
    trim: true,
  },

  budget: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 }
  },
  targetCategory: [
    {
      type: String,
    }
  ],
  targetPlatform: [
    {
      type: String,
    }
  ],

  campaignTimeline: {
    type: String
  },
  campaignRequirements: {
    deliverables: {
      type: String,
      required: true,
      trim: true,
    },
    targetAudience: {
      type: String,
      required: true,
      trim: true,
    },
    additionalRequirements: {
      type: String,
      default: "",
      trim: true,
    },
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'completed'],
    default: 'active'
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },

},
  {
    timestamps: true,
  }
)

CampaignSchema.index({ brand: 1, createdAt: -1 });
CampaignSchema.index({ status: 1 });

const Campaign = mongoose.model("Campaign", CampaignSchema);
export default Campaign;