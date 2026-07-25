const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const sessionSchema = new Schema(
  {
    hostEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    guestEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    skill: { type: String, required: true, trim: true },
    title: { type: String, default: "" },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: "Africa/Cairo" },
    durationMinutes: { type: Number, default: 60 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "rescheduled"],
      default: "pending",
      index: true,
    },
    notes: { type: String, default: "" },
    reminderSent: { type: Boolean, default: false },
    googleEventUrl: { type: String, default: "" },
    chatId: { type: String, default: "" },
    createdBy: { type: String, required: true, lowercase: true, trim: true },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true }
);

sessionSchema.index({ hostEmail: 1, startAt: 1 });
sessionSchema.index({ guestEmail: 1, startAt: 1 });
sessionSchema.index({ status: 1, startAt: 1 });

module.exports = mongoose.model("Session", sessionSchema);
