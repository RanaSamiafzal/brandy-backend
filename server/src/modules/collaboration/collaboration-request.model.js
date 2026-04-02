import mongoose from "mongoose";

const CollaborationRequestSchema = new mongoose.Schema({
  initiatedBy: {
    type: String,
    enum: ["brand", "influencer"],
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Campaign"
  },
  proposedBudget: {
    type: String,
    default: "",
    trim: true,
  },
  note: {
    type: String,
    default: "",
    trim: true,
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "cancelled"],
    default: "pending",
  },
  deliveryDays: {
    type: String,
    default: "",
  },
  attachments: [
    {
      type: String,
    }
  ],
  respondedAt: {
    type: Date,
    default: null,
  },
  deliverables: [
    {
      title: { type: String, required: true },
      dueDate: { type: Date, required: true },
      status: {
        type: String,
        enum: ["pending", "in_progress", "delivered", "approved", "rejected"],
        default: "pending"
      },
      deliveredAt: { type: Date },
      feedback: { type: String }
    }
  ],
},
  { timestamps: true });

CollaborationRequestSchema.index(
  { sender: 1, receiver: 1, campaign: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" }
  }
);

CollaborationRequestSchema.index({ sender: 1 });
CollaborationRequestSchema.index({ receiver: 1 });
CollaborationRequestSchema.index({ status: 1 });
CollaborationRequestSchema.index({ campaign: 1 });

const CollaborationRequest = mongoose.model(
  "CollaborationRequest",
  CollaborationRequestSchema
);

export default CollaborationRequest;
