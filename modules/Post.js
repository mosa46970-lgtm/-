const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema({
  authorEmail: { type: String, required: true },
  authorName: { type: String, default: "" },
  authorAvatar: { type: String, default: "" },
  content: { type: String, required: true, maxlength: 1000 },
  date: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema(
  {
    authorEmail: { type: String, required: true, lowercase: true, trim: true },
    authorName: { type: String, default: "" },
    authorAvatar: { type: String, default: "" },
    authorLevel: { type: String, default: "" },
    content: { type: String, required: true, maxlength: 3000 },
    type: {
      type: String,
      enum: ["achievement", "question", "resource", "milestone", "project", "general"],
      default: "general",
    },
    tags: { type: [String], default: [] },
    likes: { type: [String], default: [] }, // array of emails
    comments: [commentSchema],
    attachments: [
      {
        type: { type: String, enum: ["image", "link", "code"] },
        url: String,
        title: String,
        language: String,
        code: String,
      },
    ],
    isPinned: { type: Boolean, default: false },
    isHidden: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

postSchema.index({ authorEmail: 1 });
postSchema.index({ type: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ likes: 1 });

module.exports = mongoose.model("Post", postSchema);
