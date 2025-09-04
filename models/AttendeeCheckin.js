const mongoose = require("mongoose");

const AttendeeCheckinSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAuth",
      required: true,
    },

    checkinSelfie: { type: String },
    checkinTime: { type: Date },
    checkinStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "none"],
      default: "none",
    },

    checkoutSelfie: { type: String },
    checkoutTime: { type: Date },
    checkoutStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "none"],
      default: "none",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendeeCheckin", AttendeeCheckinSchema);
