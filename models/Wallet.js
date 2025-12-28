const mongoose = require("mongoose");

const getISTDate = () => {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
};

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true,
  },

  amount: {
    type: Number,
    required: true,
  },

  description: String,

  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
  },

  status: {
    type: String,
    enum: ["PENDING", "COMPLETED", "REJECTED"],
    default: "COMPLETED",
  },

  payout_mode: {
    type: String,
    enum: ["MANUAL", "AUTO"],
    default: "AUTO",
  },

  upi_id: String,

  requested_at: {
    type: Date,
    default: getISTDate,
  },

  processed_at: Date,

  processed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
  },

  date: {
    type: Date,
    default: getISTDate,
  },
});

const walletSchema = new mongoose.Schema({
  seeker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
    required: true,
    index: true,
  },

  balance: {
    type: Number,
    default: 0,
  },

  transactions: [transactionSchema],
});

module.exports = mongoose.model("Wallet", walletSchema);
