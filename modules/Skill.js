const mongoose = require("mongoose");

const skillReviewSchema = new mongoose.Schema({
  reviewerEmail: { type: String, required: true },
  reviewerName: { type: String, default: "" },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, default: "", maxlength: 1000 },
  date: { type: Date, default: Date.now },
});

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, default: "" },
  type: { type: String, enum: ["video", "article", "github", "pdf", "tool", "other"], default: "other" },
  isFree: { type: Boolean, default: true },
});

const skillSchema = new mongoose.Schema(
  {
    ownerEmail: { type: String, required: true, lowercase: true, trim: true },
    ownerName: { type: String, default: "" },
    ownerAvatar: { type: String, default: "" },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, maxlength: 3000 },
    tags: { type: [String], default: [] },
    category: { type: String, default: "Technology" },
    level: {
      type: String,
      enum: ["beginner", "intermediate", "advanced", "all"],
      default: "beginner",
    },
    language: { type: String, default: "العربية" },
    duration: { type: Number, default: 60 }, // minutes per session
    sessionCount: { type: Number, default: 4 }, // suggested sessions
    isPremium: { type: Boolean, default: false },
    coverImageUrl: { type: String, default: "" },
    videoIntroUrl: { type: String, default: "" },
    resources: [resourceSchema],
    reviews: [skillReviewSchema],
    viewCount: { type: Number, default: 0 },
    enrolledCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["active", "pending", "rejected", "archived"],
      default: "active",
    },
    prerequisites: { type: [String], default: [] },
    whatYouLearn: { type: [String], default: [] },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Virtual: average rating
skillSchema.virtual("averageRating").get(function () {
  if (!this.reviews || this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  return Math.round((sum / this.reviews.length) * 10) / 10;
});

skillSchema.set("toJSON", { virtuals: true });
skillSchema.set("toObject", { virtuals: true });

skillSchema.index({ ownerEmail: 1 });
skillSchema.index({ status: 1 });
skillSchema.index({ tags: 1 });
skillSchema.index({ category: 1 });
skillSchema.index({ level: 1 });
skillSchema.index({ isPremium: 1 });
skillSchema.index({ createdAt: -1 });
skillSchema.index({ enrolledCount: -1 });

module.exports = mongoose.model("Skill", skillSchema);
