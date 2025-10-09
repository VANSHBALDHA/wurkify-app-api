const mongoose = require("mongoose");

const eventApplicationSchema = new mongoose.Schema({
  seeker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
    required: true,
  },
  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },

  // Application Status (Hiring process)
  applicationStatus: {
    type: String,
    enum: ["pending", "accepted", "rejected", "completed"],
    default: "pending",
  },

  appliedAt: {
    type: Date,
    default: Date.now,
  },

  // ✅ Payment-related fields
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  paymentAmount: {
    type: Number,
    default: 0,
  },
  razorpay_payment_id: {
    type: String,
  },
  paymentReceivedAt: {
    type: Date,
  },
});

module.exports = mongoose.model("EventApplication", eventApplicationSchema);
