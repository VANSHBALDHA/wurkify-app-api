const Referral = require("../models/Referral");
const UserAuth = require("../models/AuthUsers");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";
const REFERRAL_APP_LINK =
  process.env.REFERRAL_APP_LINK || "https://wurkify.com/signup";

const RAZORPAY_KEY_ID = "rzp_live_RQErm1QXjwLHM9";
const RAZORPAY_KEY_SECRET = "WjywpnGqjiMdvLPYhUnjQHTT";
const BASE_URL = "https://api.razorpay.com/v1";

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

const withdrawReferralMoney = async (req, res) => {
  try {
    const { userId, upiId, bankAccount, ifsc } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID required" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded._id !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const user = await UserAuth.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    // Calculate total withdrawable from referrals
    const unpaidReferrals = await Referral.find({
      referrerId: userId,
      status: "approved",
      referrerPaid: false,
    });

    const referredRecord = await Referral.findOne({
      referredEmail: user.email,
      status: "approved",
      referredPaid: false,
    });

    const earnedFromReferring = unpaidReferrals.length * 50;
    const earnedFromBeingReferred = referredRecord ? 25 : 0;
    const totalWithdrawable = earnedFromReferring + earnedFromBeingReferred;

    const minWithdrawal = 5000;
    if (totalWithdrawable < minWithdrawal) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal is ₹${minWithdrawal}. You currently have ₹${totalWithdrawable}.`,
      });
    }

    // ✅ Step 1: Create contact (once per user)
    let contactId = user.razorpayContactId;
    if (!contactId) {
      const contactRes = await axios.post(
        `${BASE_URL}/contacts`,
        {
          name: user.name,
          email: user.email,
          type: "employee",
          reference_id: user._id.toString(),
        },
        {
          auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
        }
      );
      contactId = contactRes.data.id;
      user.razorpayContactId = contactId;
    }

    // ✅ Step 2: Create fund account (UPI or Bank)
    let fundAccountRes;
    if (upiId) {
      fundAccountRes = await axios.post(
        `${BASE_URL}/fund_accounts`,
        {
          contact_id: contactId,
          account_type: "vpa",
          vpa: { address: upiId },
        },
        {
          auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
        }
      );
    } else if (bankAccount && ifsc) {
      fundAccountRes = await axios.post(
        `${BASE_URL}/fund_accounts`,
        {
          contact_id: contactId,
          account_type: "bank_account",
          bank_account: {
            name: user.name,
            account_number: bankAccount,
            ifsc: ifsc,
          },
        },
        {
          auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
        }
      );
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide either UPI ID or bank account + IFSC",
      });
    }

    const fundAccountId = fundAccountRes.data.id;

    // ✅ Step 3: Create payout request
    const payoutRes = await axios.post(
      `${BASE_URL}/payouts`,
      {
        account_number: "300004000017531",
        fund_account_id: fundAccountId,
        amount: totalWithdrawable * 100,
        currency: "INR",
        mode: upiId ? "UPI" : "IMPS",
        purpose: "payout",
        queue_if_low_balance: true,
        narration: "Referral Withdrawal",
      },
      {
        auth: { username: RAZORPAY_KEY_ID, password: RAZORPAY_KEY_SECRET },
      }
    );

    // ✅ Step 4: Update referral + user data
    await Referral.updateMany(
      { referrerId: userId, status: "approved", referrerPaid: false },
      { $set: { referrerPaid: true } }
    );

    if (referredRecord) {
      referredRecord.referredPaid = true;
      await referredRecord.save();
    }

    user.referralWithdrawals = user.referralWithdrawals || [];
    user.referralWithdrawals.push({
      amount: totalWithdrawable,
      date: new Date(),
      razorpayPayoutId: payoutRes.data.id,
      status: payoutRes.data.status || "processing",
    });
    await user.save();

    res.status(200).json({
      success: true,
      message: `₹${totalWithdrawable} payout initiated via Razorpay.`,
      data: payoutRes.data,
    });
  } catch (err) {
    console.error("withdrawReferralMoney error:", err.response?.data || err);
    res.status(500).json({
      success: false,
      message: "Withdrawal failed",
      error: err.response?.data || err.message,
    });
  }
};

module.exports = {
  getReferralSummary,
  withdrawReferralMoney,
};
