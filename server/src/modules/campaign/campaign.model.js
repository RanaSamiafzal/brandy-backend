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
  budget: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Referencing the User model directly as requested (brand userId)
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'paused'],
    default: 'pending',
  },
  image: {
    type: String,
    default: "",
  },
  isDeleted: {
    type: Boolean,
    default: false,
  }
}, {
  timestamps: true,
});

// Text index on campaign name for search optimization
CampaignSchema.index({ name: 'text' });

// Normal indexes for filtering
CampaignSchema.index({ brand: 1, status: 1 });
CampaignSchema.index({ startDate: 1, endDate: 1 });

const Campaign = mongoose.model("Campaign", CampaignSchema);

export default Campaign;
