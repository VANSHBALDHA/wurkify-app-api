const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserAuth",
      required: true,
    },
    referredEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    referrerBonus: {
      type: Number,
      default: 50, // ₹50 for referrer
    },
    referredBonus: {
      type: Number,
      default: 25, // ₹25 for referred user
    },
    referrerPaid: {
      type: Boolean,
      default: false, // mark true after withdrawal
    },
    referredPaid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
  },
  { timestamps: true }
);

const Referral = mongoose.model("Referral", referralSchema);
module.exports = Referral;
