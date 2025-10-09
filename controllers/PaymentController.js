const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const EventApplication = require("../models/EventApplication");
const UserAuth = require("../models/AuthUsers");
const mongoose = require("mongoose");
const Wallet = require("../models/Wallet");
const axios = require("axios");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

/**
 * ✅ Organizer releases payment to seeker (credits their wallet)
 */
const releasePaymentToSeeker = async (req, res) => {
  try {
    const { eventId, seekerId, amount } = req.body;

    if (!eventId || !seekerId || !amount) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    // Find or create wallet for seeker
    let wallet = await Wallet.findOne({ seeker_id: seekerId });
    if (!wallet) {
      wallet = new Wallet({ seeker_id: seekerId, balance: 0 });
    }

    // Add credit transaction
    wallet.balance += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      event_id: eventId,
      description: "Payment received for completed event",
      date: new Date(),
    });

    await wallet.save();

    // Mark payment as credited in EventApplication
    await EventApplication.findOneAndUpdate(
      { event_id: eventId, seeker_id: seekerId },
      { paymentStatus: "credited" },
      { new: true }
    );

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

/**
 * ✅ Seeker: Fetch wallet balance and transactions
 */
const getWalletDetails = async (req, res) => {
  try {
    const { seekerId } = req.body;
    if (!seekerId) {
      return res
        .status(400)
        .json({ success: false, message: "Seeker ID required" });
    }

    const wallet = await Wallet.findOne({ seeker_id: seekerId }).populate(
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

/**
 * Organizer: Fetch all events with payment summary
 */
/**
 * Organizer: Fetch all events with payment summary + total spent
 */
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

        // Calculate spend for this event
        const totalEventSpend = completedPayments.reduce(
          (sum, app) => sum + (app.paymentAmount || event.paymentAmount || 0),
          0
        );

        // Add to overall total
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
      totalSpendMoney, // ✅ added total spent money (across all events)
      events: formattedEvents,
    });
  } catch (err) {
    console.error("Get Payment Event List Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Organizer: Fetch seeker payment details for a specific event
 */
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

/**
 * ✅ Flutter-based payment success handler
 * Auto credits seeker’s wallet on payment success
 */
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

    // ✅ Auto credit to wallet
    let wallet = await Wallet.findOne({ seeker_id: seekerObjectId });
    if (!wallet) {
      wallet = new Wallet({
        seeker_id: seekerObjectId,
        balance: 0,
        transactions: [],
      });
    }

    const creditAmount = amount || event.paymentAmount;

    wallet.balance += creditAmount;
    wallet.transactions.push({
      type: "credit",
      amount: creditAmount,
      event_id: eventObjectId,
      description: "Payment received for event",
      date: new Date(),
    });

    await wallet.save();

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

/**
 * ✅ Seeker: Get all credited payments + total earning
 */
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

/**
 * ✅ Seeker: Withdraw earnings from wallet
 */
const withdrawSeekerEarnings = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const { amount, upiId } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid withdrawal amount" });
    }

    if (!upiId) {
      return res
        .status(400)
        .json({ success: false, message: "UPI ID is required" });
    }

    // Fetch wallet
    const wallet = await Wallet.findOne({ seeker_id: seekerId });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    // ✅ Call RazorpayX Payout API
    const response = await axios.post(
      "https://api.razorpay.com/v1/payouts",
      {
        account_number: process.env.RAZORPAYX_ACCOUNT_NO,
        fund_account: {
          account_type: "vpa",
          vpa: { address: upiId },
        },
        amount: amount * 100,
        currency: "INR",
        mode: "UPI",
        purpose: "payout",
        narration: "Seeker Wallet Withdrawal",
      },
      {
        auth: {
          username: process.env.RAZORPAY_KEY_ID,
          password: process.env.RAZORPAY_KEY_SECRET,
        },
      }
    );

    const payout = response.data;

    // ✅ Deduct from wallet and save
    wallet.balance -= amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      description: `Withdrawal via Razorpay (Payout ID: ${payout.id})`,
      date: new Date(),
    });
    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Withdrawal successful via Razorpay",
      payout,
      walletBalance: wallet.balance,
    });
  } catch (err) {
    console.error("Withdraw Error:", err.response?.data || err.message);
    return res
      .status(500)
      .json({ success: false, message: "Withdrawal failed" });
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
};
