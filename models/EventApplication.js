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
  applicationStatus: {
    type: String,
    enum: ["pending", "accepted", "rejected", "completed"],
    default: "pending",
  },
  appliedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("EventApplication", eventApplicationSchema);
