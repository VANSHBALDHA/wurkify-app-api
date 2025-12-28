const Wallet = require("../models/Wallet");
const UserAuth = require("../models/AuthUsers");

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

module.exports = {
  getAdminWithdrawalList,
};
