const Referral = require("../models/Referral");
const UserAuth = require("../models/AuthUsers");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getReferralSummary = async (req, res) => {
  try {
    const { userId } = req.params;

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

    // ✅ Find the logged-in user
    const user = await UserAuth.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ Find all referrals where user is the referrer
    const referralsMade = await Referral.find({
      referrerId: userId,
      status: "approved",
    });

    // ✅ Calculate totals
    const totalReferrals = referralsMade.length;
    const totalEarned = totalReferrals * 50; // ₹50 per referral

    // ✅ If user was referred by someone, add ₹25 referred bonus
    const referredBonus = user.referredBy && user.isVerified ? 25 : 0;

    const totalAvailable = totalEarned + referredBonus;
    const minWithdrawal = 5000;
    const isEligibleForWithdrawal = totalAvailable >= minWithdrawal;

    res.status(200).json({
      success: true,
      message: "Referral summary fetched successfully",
      data: {
        referralCode: user.referralCode,
        referredBy: user.referredBy || null,
        totalReferrals,
        totalEarned,
        referredBonus,
        totalAvailable,
        minWithdrawal,
        isEligibleForWithdrawal,
        referrals: referralsMade.map((r) => ({
          referrerBonus: r.referrerBonus,
          referredBonus: r.referredBonus,
          status: r.status,
          createdAt: r.createdAt,
        })),
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
