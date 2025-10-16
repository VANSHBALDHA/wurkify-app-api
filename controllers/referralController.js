const Referral = require("../models/Referral");
const UserAuth = require("../models/AuthUsers");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";
const REFERRAL_APP_LINK =
  process.env.REFERRAL_APP_LINK || "https://wurkify.com/signup";

const getReferralSummary = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    if (decoded._id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // ✅ Find logged-in user
    const user = await UserAuth.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ Referrals made by this user
    const referralsMade = await Referral.find({
      referrerId: userId,
      status: "approved",
    });

    // ✅ Referral record where YOU were referred by someone
    const referredRecord = await Referral.findOne({
      referredEmail: user.email,
      status: "approved",
    });

    // ✅ Calculate totals
    const totalReferrals = referralsMade.length;
    const referrerBonusPerUser = 50;
    const referredBonusAmount = referredRecord ? 25 : 0;

    const earnedFromReferring = totalReferrals * referrerBonusPerUser;
    const earnedFromBeingReferred = referredBonusAmount;

    const totalAvailable = earnedFromReferring + earnedFromBeingReferred;
    const minWithdrawal = 5000;
    const isEligibleForWithdrawal = totalAvailable >= minWithdrawal;

    // ✅ Generate referral link
    const appLink = `${REFERRAL_APP_LINK}?ref=${user.referralCode}`;

    // ✅ Combine cashback + referral bonuses in ONE array
    const referrals = [];

    // Case 1️⃣: If user was referred → add cashback entry
    if (referredRecord) {
      const referrerUser = await UserAuth.findById(referredRecord.referrerId);
      referrals.push({
        type: "cashback",
        amount: 25,
        referredBy: referrerUser?.name || "Friend",
        referredCode: referrerUser?.referralCode || "N/A",
        message: `You earned ₹25 cashback for joining using ${
          referrerUser?.name || "a friend's"
        } referral code.`,
        status: "approved",
        date: referredRecord.createdAt,
      });
    }

    // Case 2️⃣: Add entries for users you referred
    referralsMade.forEach((r) => {
      referrals.push({
        type: "referral",
        amount: 50,
        referredName: r.referredName || "Unknown",
        referredEmail: r.referredEmail,
        message: `You earned ₹50 for referring ${
          r.referredName || r.referredEmail
        }.`,
        status: r.status,
        date: r.createdAt,
      });
    });

    // ✅ Sort newest first
    referrals.sort((a, b) => new Date(b.date) - new Date(a.date));

    // ✅ Prepare final response
    res.status(200).json({
      success: true,
      message: "Referral summary fetched successfully",
      data: {
        referralCode: user.referralCode,
        appLink,
        referredBy: user.referredBy || null,
        totalReferrals,
        totalEarned: earnedFromReferring,
        totalAvailable,
        minWithdrawal,
        isEligibleForWithdrawal,
        referrals, // 👈 unified array for cashback + referral bonuses
      },
    });
  } catch (err) {
    console.error("getReferralSummary error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getReferralSummary,
};
