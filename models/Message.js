const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  group_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Group",
    required: true,
  },

  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
    required: true,
  },

  messageType: {
    type: String,
    enum: ["text", "audio", "media"],
    default: "text",
  },

  text: { type: String },

  audio: {
    url: String,
    duration: Number,
    waveform: [Number],
  },

  media: [
    {
      url: { type: String },
      type: { type: String },
      format: { type: String },
      size: { type: Number },
      originalName: { type: String },
    },
  ],

  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent",
  },

  createdAt: { type: Date, default: Date.now },
});

module.exports =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
