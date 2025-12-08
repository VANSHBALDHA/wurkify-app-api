const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    receiver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAuth",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
    },
    type: {
      type: String,
      enum: [
        "event",
        "system",
        "application",
        "earning",
        "custom",
        "attendance",
        "checkout",
        "event-completed",
        "payment",
      ],
      default: "custom",
    },
    event_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
