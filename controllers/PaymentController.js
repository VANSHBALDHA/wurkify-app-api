const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const EventApplication = require("../models/EventApplication");
const UserAuth = require("../models/AuthUsers");
const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const { sendNotification } = require("../middlewares/notificationService");
const { default: axios } = require("axios");
const { seekerMessages } = require("../utils/seekerNotifications");
const { organizerMessages } = require("../utils/organizerNotifications");

const CASHFREE_BASE_URL = "https://payout-api.cashfree.com/payout/v1";

const getISTDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const CASHFREE_CLIENT_ID = "CF1155859D54F4DR2M96C738CNA50";
const CASHFREE_CLIENT_SECRET =
  "cfsk_ma_prod_95aed5aee101ffc6f9f162b48bddbaf7_59f5e4e9";

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const releasePaymentToSeeker = async (req, res) => {
  try {
    const { eventId, seekerId, amount } = req.body;

    if (!eventId || !seekerId || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    const event = await Event.findOne({
      _id: eventId,
      organizer_id: organizerId,
    });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or not owned by you",
      });
    }

    let wallet = await Wallet.findOne({ seeker_id: seekerId });
    if (!wallet) {
      wallet = new Wallet({ seeker_id: seekerId, balance: 0 });
    }

    wallet.balance += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      event_id: eventId,
      description: "Payment received for completed event",
      date: new Date(),
    });

    await wallet.save();

    const orgMsg = organizerMessages.paySuccess(
      event.eventName,
      seeker.name,
      amount
    );

    await sendNotification({
      sender_id: organizerId,
      receiver_id: organizerId,
      event_id: eventId,
      type: "payment",
      title: orgMsg.title,
      message: orgMsg.message,
    });

    const seekerMsg = seekerMessages.paymentCredited(event.eventName, amount);

    await sendNotification({
      sender_id: organizerId,
      receiver_id: seekerId,
      event_id: eventId,
      type: "payment",
      title: seekerMsg.title,
      message: seekerMsg.message,
    });

    await EventApplication.findOneAndUpdate(
      { event_id: eventId, seeker_id: seekerId },
      { paymentStatus: "credited", paymentReceivedAt: new Date() },
      { new: true }
    );

    const allApplications = await EventApplication.find({ event_id: eventId });
    const allPaid = allApplications.every(
      (a) => a.paymentStatus === "completed" || a.paymentStatus === "credited"
    );

    if (allPaid) {
      await Event.findByIdAndUpdate(eventId, { eventStatus: "completed" });

      const deletedGroup = await Group.findOneAndDelete({ event_id: eventId });

      const acceptedSeekers = allApplications.filter(
        (a) => a.applicationStatus === "accepted"
      );

      for (const seeker of acceptedSeekers) {
        await sendNotification({
          sender_id: organizerId,
          receiver_id: seeker.seeker_id,
          event_id: eventId,
          type: "event",
          title: "Event Completed 🎉",
          message: `All payments for the event "${event.eventName}" have been completed. The event is now marked as completed.`,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment credited to seeker's wallet successfully",
      data: wallet,
    });
  } catch (err) {
    console.error("Release Payment Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getWalletDetails = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = decoded._id;

    const wallet = await Wallet.findOne({ seeker_id: userId }).populate(
      "transactions.event_id",
      "eventName location"
    );

    if (!wallet) {
      return res.status(200).json({
        success: true,
        message: "Wallet not found, returning empty balance",
        wallet: { balance: 0, transactions: [] },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Wallet details fetched successfully",
      wallet,
    });
  } catch (err) {
    console.error("Get Wallet Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPaymentEventList = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user || user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access payments",
      });
    }

    const events = await Event.find({ organizer_id: userId }).sort({
      createdAt: -1,
    });

    let totalSpendMoney = 0;

    const formattedEvents = await Promise.all(
      events.map(async (event) => {
        const totalApplicants = await EventApplication.countDocuments({
          event_id: event._id,
        });

        const completedPayments = await EventApplication.find({
          event_id: event._id,
          paymentStatus: { $in: ["completed", "credited"] },
        });

        const totalEventSpend = completedPayments.reduce(
          (sum, app) => sum + (app.paymentAmount || event.paymentAmount || 0),
          0
        );

        totalSpendMoney += totalEventSpend;

        return {
          event_id: event._id,
          eventName: event.eventName,
          location: event.location,
          totalApplicants,
          completedPayments: completedPayments.length,
          totalEventSpend,
          status: event.eventStatus,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Payment event list fetched successfully",
      totalEvents: formattedEvents.length,
      totalSpendMoney,
      events: formattedEvents,
    });
  } catch (err) {
    console.error("Get Payment Event List Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getEventUserPayments = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user || user.role !== "organizer") {
      return res
        .status(403)
        .json({ success: false, message: "Only organizers can access this" });
    }

    const { eventId } = req.body;
    if (!eventId) {
      return res
        .status(400)
        .json({ success: false, message: "Event ID is required" });
    }

    const event = await Event.findOne({ _id: eventId, organizer_id: userId });
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found or unauthorized" });
    }

    const applications = await EventApplication.find({ event_id: eventId })
      .populate("seeker_id", "name email phone role")
      .sort({ createdAt: -1 });

    const applicants = applications.map((app) => ({
      seeker_id: app.seeker_id._id,
      name: app.seeker_id.name,
      email: app.seeker_id.email,
      phone: app.seeker_id.phone,
      role: app.seeker_id.role,
      appliedAt: app.createdAt,
      applicationStatus: app.applicationStatus || "pending",
      paymentStatus: app.paymentStatus || "pending",
      amount: event.paymentAmount,
      dueDate: event.startDate,
    }));

    return res.status(200).json({
      success: true,
      message: "Event user payments fetched successfully",
      total: applicants.length,
      applicants,
    });
  } catch (err) {
    console.error("Get Event User Payments Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { eventId, seekerId, paymentId, amount } = req.body;

    if (!eventId || !seekerId || !paymentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    const eventObjectId = new mongoose.Types.ObjectId(eventId);
    const seekerObjectId = new mongoose.Types.ObjectId(seekerId);

    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const organizerId = event.organizer_id;
    const seeker = await UserAuth.findById(seekerObjectId);

    // ✅ Update or create application
    let application = await EventApplication.findOneAndUpdate(
      { event_id: eventObjectId, seeker_id: seekerObjectId },
      {
        $set: {
          paymentStatus: "completed",
          razorpay_payment_id: paymentId,
          paymentAmount: amount || event.paymentAmount,
          paymentReceivedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    let wallet = await Wallet.findOne({ seeker_id: seekerObjectId });
    if (!wallet) {
      wallet = new Wallet({
        seeker_id: seekerObjectId,
        balance: 0,
        transactions: [],
      });
    }

    const creditAmount = Number(amount || event.paymentAmount || 0);

    wallet.balance += creditAmount;
    wallet.transactions.push({
      type: "credit",
      amount: creditAmount,
      event_id: eventObjectId,
      description: "Payment received for event",
      date: new Date(),
    });

    await wallet.save();

    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount",
      });
    }

    const captureAmountPaise = Math.round(creditAmount * 100);

    let captureRes;
    try {
      captureRes = await axios.post(
        `https://api.razorpay.com/v1/payments/${paymentId}/capture`,
        {
          amount: captureAmountPaise,
          currency: "INR",
        },
        {
          auth: {
            username: "rzp_live_RQErm1QXjwLHM9",
            password: "WjywpnGqjiMdvLPYhUnjQHTT",
          },
        }
      );

      if (!captureRes.data || captureRes.data.status !== "captured") {
        return res.status(400).json({
          success: false,
          message: "Payment capture failed or not in captured state",
          razorpay: captureRes.data,
        });
      }
    } catch (err) {
      console.error("❌ Razorpay capture error:", err.response?.data || err);

      // Common 401 cause: wrong key/secret OR using test keys for live payment
      if (err.response?.status === 401) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized with Razorpay. Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and mode (test/live).",
          razorpay: err.response.data,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Failed to capture payment with Razorpay",
        razorpay: err.response?.data,
      });
    }

    if (organizerId && seeker) {
      const seekerDoc = await UserAuth.findById(seekerId);
      const orgMsg = organizerMessages.paySuccess(
        event.eventName,
        seekerDoc?.name || "Seeker",
        creditAmount
      );

      await sendNotification({
        sender_id: organizerId,
        receiver_id: organizerId,
        event_id: eventId,
        type: "earning", // or "event"
        title: orgMsg.title,
        message: orgMsg.message,
      });
    }

    // 🔹 Seeker notification: payment credited
    if (seeker) {
      const seekerMsg = seekerMessages.paymentCredited(
        event.eventName,
        creditAmount
      );

      await sendNotification({
        sender_id: organizerId,
        receiver_id: seekerId,
        event_id: eventId,
        type: "earning", // or "event"
        title: seekerMsg.title,
        message: seekerMsg.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment stored and credited successfully",
      data: { application, wallet },
    });
  } catch (err) {
    console.error("Update Payment Status Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getSeekerEarnings = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    // Fetch wallet
    const wallet = await Wallet.findOne({ seeker_id: seekerId }).populate(
      "transactions.event_id",
      "eventName"
    );

    if (!wallet || wallet.transactions.length === 0) {
      return res.status(200).json({
        success: true,
        totalEarnings: 0,
        transactions: [],
      });
    }

    const formattedTransactions = wallet.transactions
      .filter((t) => t.type === "credit")
      .sort((a, b) => b.date - a.date)
      .map((t) => ({
        title: t.event_id?.eventName || "Event Payment",
        amount: t.amount,
        type: t.type,
        date: t.date,
      }));

    const totalEarnings = wallet.transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    return res.status(200).json({
      success: true,
      totalEarnings,
      transactions: formattedTransactions,
    });
  } catch (err) {
    console.error("Get Seeker Earnings Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createCashfreeUPIPayoutV2 = async ({ amount, beneficiaryId, upiId }) => {
  const transferId = `WURK_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)
    .toUpperCase()}`;

  try {
    const response = await axios.post(
      "https://api.cashfree.com/payout/transfers",
      {
        transfer_id: transferId,
        transfer_amount: amount.toString(),
        transfer_currency: "INR",
        transfer_mode: "upi",
        beneficiary_details: {
          beneficiary_id: beneficiaryId,
        },
        transfer_note: `UPI payout to VPA: ${upiId}`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-version": "2024-01-01",
          "x-client-id": CASHFREE_CLIENT_ID,
          "x-client-secret": CASHFREE_CLIENT_SECRET,
        },
      }
    );
    return response.data;
  } catch (err) {
    console.error("Create Payout Error:", err.response?.data || err.message);
    throw err;
  }
};

const withdrawSeekerEarnings = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const { amount, upiId } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid withdrawal amount" });
    }

    if (numericAmount < 1) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Minimum withdrawal amount is ₹1" });
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,49}@[a-zA-Z]{2,}$/;
    if (!upiId || !upiRegex.test(upiId)) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Invalid UPI ID format" });
    }

    const user = await UserAuth.findById(seekerId).session(session);
    if (!user) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const wallet = await Wallet.findOne({ seeker_id: seekerId }).session(
      session
    );
    if (!wallet || wallet.balance < numericAmount) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ success: false, message: "Insufficient wallet balance" });
    }

    const payoutRes = await createCashfreeUPIPayoutV2({
      amount: numericAmount,
      beneficiaryId: seekerId.toString(),
      upiId: upiId,
    });

    const payoutStatus = payoutRes.status || "PENDING";
    const payoutTransferId = payoutRes.cf_transfer_id || payoutRes.transfer_id;

    wallet.balance -= numericAmount;
    wallet.transactions.push({
      type: "debit",
      amount: numericAmount,
      description: `Withdrawal via Cashfree UPI (Transfer ID: ${payoutTransferId})`,
      date: new Date(),
      status: payoutStatus,
      payout_id: payoutTransferId,
      upi_id: upiId,
    });

    await wallet.save({ session });
    await session.commitTransaction();

    try {
      await sendNotification({
        sender_id: seekerId,
        receiver_id: seekerId,
        type: "withdrawal",
        title: "Withdrawal Initiated 💸",
        message: `Your withdrawal of ₹${numericAmount} to UPI ID ${upiId} has been initiated. Transfer ID: ${payoutTransferId}. Status: ${payoutStatus}.`,
      });
    } catch (err) {
      console.error("Notification error:", err);
    }

    return res.status(200).json({
      success: payoutStatus === "SUCCESS" || payoutStatus === "PENDING",
      message: payoutRes.message || "Withdrawal initiated successfully",
      payoutStatus,
      payoutTransferId,
      balance: wallet.balance,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error(
      "Cashfree Production Error:",
      err.response?.data || err.message
    );

    let userMessage = "Withdrawal failed. Please try again.";
    let statusCode = 500;

    if (err.response?.data?.message?.includes("INVALID_BENE_VPA")) {
      userMessage =
        "The provided UPI ID is invalid. Please check and try again.";
      statusCode = 400;
    } else if (err.response?.data?.message?.includes("beneficiary_not_found")) {
      userMessage = "Payment setup issue. Please contact support.";
      statusCode = 400;
    } else if (err.response?.data?.message?.includes("INSUFFICIENT_BALANCE")) {
      userMessage =
        "Our payment gateway has insufficient funds. Please try again later or contact support.";
      statusCode = 503;
    } else if (err.response?.status === 401) {
      userMessage =
        "Payment gateway authentication failed. Please contact support.";
      statusCode = 500;
    }

    return res.status(statusCode).json({
      success: false,
      message: userMessage,
      error: err.response?.data,
    });
  } finally {
    session.endSession();
  }
};

const requestSeekerWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      await session.abortTransaction();
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const { amount, upiId } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount",
      });
    }

    const upiRegex = /^[a-zA-Z0-9.\-_]{2,49}@[a-zA-Z]{2,}$/;
    if (!upiId || !upiRegex.test(upiId)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid UPI ID",
      });
    }

    const seeker = await UserAuth.findById(seekerId).session(session);
    if (!seeker) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const wallet = await Wallet.findOne({ seeker_id: seekerId }).session(
      session
    );

    if (!wallet || wallet.balance < withdrawAmount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    wallet.balance -= withdrawAmount;

    const transaction = {
      type: "debit",
      amount: withdrawAmount,
      description: "Withdrawal request submitted",
      date: getISTDate(),
      status: "PENDING",
      payout_mode: "MANUAL",
      upi_id: upiId,
      requested_at: getISTDate(),
    };

    wallet.transactions.push(transaction);

    await wallet.save({ session });
    await session.commitTransaction();

    try {
      await sendNotification({
        sender_id: seekerId,
        receiver_id: seekerId,
        type: "withdrawal",
        title: "Withdrawal Requested ⏳",
        message: `Your withdrawal of ₹${transaction.amount} has been submitted. You will receive it within 48–72 hours.`,
      });
    } catch (err) {
      console.error("Notification error:", err);
    }

    return res.status(200).json({
      success: true,
      message:
        "Withdrawal request submitted successfully. You will receive your payment within 48-72 hours.",
      balance: wallet.balance,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("Withdrawal Request Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  getPaymentEventList,
  getEventUserPayments,
  updatePaymentStatus,
  releasePaymentToSeeker,
  getWalletDetails,
  getSeekerEarnings,
  withdrawSeekerEarnings,
  requestSeekerWithdrawal,
};
