import mongoose from "mongoose";

const CollaborationRequestSchema = new mongoose.Schema({

  // who started the collaboration
  initiatedBy: {
    type: String,
    enum: ["brand", "influencer"],
    required: true
  },

  // Who created the request (brand )
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  // Who receives the request
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  // campaign related
  campaignRelated: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Campaign"
  },
  // Optional: negotiated or offered price
  proposedBudget: {
    type: Number,
    default: null,
  },
  // Optional message / proposal text-note
  note: {
    type: String,
    default: "",
    trim: true,
  },
  // Request status (drives your tabs: All / Pending / Accepted / Rejected)
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "cancelled"],
    default: "pending",
  },
  deliveryDays: {
    type: String,
    required: true
  },
  attachments: [
    {
      type: String,
    }
  ],
  // When influencer/brand responded
  respondedAt: {
    type: Date,
    default: null,
  },

  // Collaboration Hub Deliverables
  deliverables: [
    {
      title: { type: String, required: true }, // e.g., "RECORD VIDEO", "EDITING"
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
  { timestamps: true })

// Prevent duplicate requests for same campaign + same influencer
// CollaborationRequestSchema.index(
//   { sender: 1, receiver: 1, campaignRelated: 1 },
//   { unique: true }
// );
CollaborationRequestSchema.index(
  { sender: 1, receiver: 1, campaignRelated: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" }
  }
);

const CollaborationRequest = mongoose.model(
  "CollaborationRequest",
  CollaborationRequestSchema
);

export default CollaborationRequest;