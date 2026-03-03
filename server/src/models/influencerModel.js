import mongoose from "mongoose";

const InfluencerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    about: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String, // e.g. "Fashion", "Tech", "Fitness", "Model"
      default: "",
      trim: true,
    },

    //  Unified platforms + pricing
    platforms: [
      {
        name: {
          type: String, // e.g. Instagram, YouTube, TikTok, Modeling, Event
          required: true,
          trim: true,
        },

        username: {
          type: String, // account username (if applicable)
          trim: true,
        },

        followers: {
          type: Number,
          default: 0,
        },

        profileUrl: {
          type: String,
          trim: true,
        },

        influenceRate: {
          type: Number, // 1 to 10
          min: 1,
          max: 10,
          default: 5,
        },

        //  Services & pricing for this platform
        services: [
          {
            contentType: {
              type: String, // e.g. Post, Reel, Story, Vlog, PhotoShoot, Appearance
              required: true,
              trim: true,
            },

            price: {
              type: Number,
              required: true,
              min: 0,
            },

            description: {
              type: String,
              default: "",
              trim: true,
            },
          },
        ],
      },
    ],

    portfolio: {
      type: String,
      default: "",
      trim: true,
    },

    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    location: {
      type: String,
      default: "",
      trim: true,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

InfluencerSchema.index({ category: 1 });
InfluencerSchema.index({ location: 1 });
InfluencerSchema.index({ averageRating: -1 });
InfluencerSchema.index({ "platforms.name": 1 });

const Influencer = mongoose.model("Influencer", InfluencerSchema);
export default Influencer;
