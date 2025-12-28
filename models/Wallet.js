const mongoose = require("mongoose");

const getISTDate = () => {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
};

const walletSchema = new mongoose.Schema({
  seeker_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
    required: true,
  },
  balance: {
    type: Number,
    default: 0,
  },
  transactions: [
    {
      type: {
        type: String,
        enum: ["credit", "debit"],
        required: true,
      },
      amount: {
        type: Number,
        required: true,
      },
      description: {
        type: String,
      },
      event_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
      },
      date: {
        type: Date,
        default: getISTDate,
      },
    },
  ],
});

module.exports = mongoose.model("Wallet", walletSchema);
