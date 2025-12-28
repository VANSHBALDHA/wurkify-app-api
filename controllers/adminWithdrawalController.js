const Wallet = require("../models/Wallet");
const { sendNotification } = require("../middlewares/notificationService");

const formatIST = (date) =>
  date
    ? new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

const getAdminWithdrawalList = async (req, res) => {
  try {
    const { status = "PENDING", page = 1, limit = 10 } = req.query;

    const wallets = await Wallet.find({
      "transactions.type": "debit",
      "transactions.payout_mode": "MANUAL",
      ...(status !== "ALL" && { "transactions.status": status }),
    })
      .populate("seeker_id", "name email phone")
      .lean();

    const withdrawals = [];

    wallets.forEach((wallet) => {
      wallet.transactions.forEach((tx) => {
        if (
          tx.type === "debit" &&
          tx.payout_mode === "MANUAL" &&
          (status === "ALL" || tx.status === status)
        ) {
          withdrawals.push({
            wallet_id: wallet._id,
            transaction_id: tx._id,

            seeker_id: wallet.seeker_id?._id,
            username: wallet.seeker_id?.name,
            email: wallet.seeker_id?.email,
            phone: wallet.seeker_id?.phone,

            withdraw_amount: tx.amount,
            upi_id: tx.upi_id,
            status: tx.status,

            requested_at: formatIST(tx.requested_at),
            processed_at: formatIST(tx.processed_at),

            remark: tx.remark || null,
          });
        }
      });
    });

    withdrawals.sort(
      (a, b) => new Date(b.requested_at) - new Date(a.requested_at)
    );

    const start = (page - 1) * limit;
    const paginated = withdrawals.slice(start, start + Number(limit));

    return res.status(200).json({
      success: true,
      total: withdrawals.length,
      page: Number(page),
      limit: Number(limit),
      withdrawals: paginated,
    });
  } catch (err) {
    console.error("Admin Withdrawal List Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const approveWithdrawal = async (req, res) => {
  try {
    const { wallet_id, transaction_id } = req.body;

    if (!wallet_id || !transaction_id) {
      return res.status(400).json({
        success: false,
        message: "wallet_id and transaction_id are required",
      });
    }

    const wallet = await Wallet.findOne({
      _id: wallet_id,
      "transactions._id": transaction_id,
    }).populate("seeker_id");

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found",
      });
    }

    const transaction = wallet.transactions.id(transaction_id);

    if (!transaction || transaction.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Only pending withdrawals can be approved",
      });
    }

    // ✅ Update transaction
    transaction.status = "COMPLETED";
    transaction.processed_at = new Date();
    transaction.remark = "Withdrawal approved by admin";

    await wallet.save();

    /* 🔔 Notification */
    try {
      await sendNotification({
        sender_id: req.user?._id || wallet.seeker_id._id,
        receiver_id: wallet.seeker_id._id,
        type: "withdrawal",
        title: "Withdrawal Approved ✅",
        message: `Your withdrawal of ₹${transaction.amount} has been approved. You will receive the amount shortly.`,
      });
    } catch (err) {
      console.error("Approve notification error:", err);
    }

    return res.status(200).json({
      success: true,
      message: "Withdrawal approved successfully",
    });
  } catch (err) {
    console.error("Approve Withdrawal Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const rejectWithdrawal = async (req, res) => {
  try {
    const { wallet_id, transaction_id, remark } = req.body;

    if (!wallet_id || !transaction_id) {
      return res.status(400).json({
        success: false,
        message: "wallet_id and transaction_id are required",
      });
    }

    const wallet = await Wallet.findOne({
      _id: wallet_id,
      "transactions._id": transaction_id,
    }).populate("seeker_id");

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found",
      });
    }

    const transaction = wallet.transactions.id(transaction_id);

    if (!transaction || transaction.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        message: "Only pending withdrawals can be rejected",
      });
    }

    wallet.balance += transaction.amount;

    transaction.status = "REJECTED";
    transaction.processed_at = new Date();
    transaction.remark = remark || "Withdrawal rejected by admin";

    await wallet.save();

    try {
      await sendNotification({
        sender_id: req.user?._id || wallet.seeker_id._id,
        receiver_id: wallet.seeker_id._id,
        type: "withdrawal",
        title: "Withdrawal Rejected ❌",
        message: `Your withdrawal of ₹${transaction.amount} was rejected. The amount has been refunded to your wallet.`,
      });
    } catch (err) {
      console.error("Reject notification error:", err);
    }

    return res.status(200).json({
      success: true,
      message: "Withdrawal rejected and amount refunded",
      balance: wallet.balance,
    });
  } catch (err) {
    console.error("Reject Withdrawal Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  getAdminWithdrawalList,
  approveWithdrawal,
  rejectWithdrawal,
};
