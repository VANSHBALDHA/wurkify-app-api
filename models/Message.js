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
  text: { type: String, required: true },
  status: {
    type: String,
    enum: ["sent", "delivered", "seen"],
    default: "sent",
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);
