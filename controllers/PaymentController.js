const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const EventApplication = require("../models/EventApplication");
const UserAuth = require("../models/AuthUsers");
const razorpay = require("../utils/razorpay");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getPaymentEventList = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
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

    const formattedEvents = await Promise.all(
      events.map(async (event) => {
        const totalApplicants = await EventApplication.countDocuments({
          event_id: event._id,
        });
        const completedPayments = await EventApplication.countDocuments({
          event_id: event._id,
          paymentStatus: "completed",
        });

        return {
          event_id: event._id,
          eventName: event.eventName,
          location: event.location,
          totalApplicants,
          completedPayments,
          status: event.eventStatus,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Payment event list fetched successfully",
      total: formattedEvents.length,
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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
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

const createPaymentOrder = async (req, res) => {
  try {
    const { amount, eventId, seekerId } = req.body;

    if (!amount || !eventId || !seekerId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }
    const shortEventId = eventId.toString().slice(-6);
    const options = {
      amount: (amount * 100) / 100,
      currency: "INR",
      receipt: `EVT${shortEventId}_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      eventId,
      seekerId,
    });
  } catch (err) {
    console.error("Create Payment Order Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      eventId,
      seekerId,
    } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    await EventApplication.findOneAndUpdate(
      { event_id: eventId, seeker_id: seekerId },
      { paymentStatus: "completed", razorpay_payment_id },
      { new: true }
    );

    return res
      .status(200)
      .json({ success: true, message: "Payment verified & updated" });
  } catch (err) {
    console.error("Verify Payment Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getPaymentEventList,
  getEventUserPayments,
  createPaymentOrder,
  verifyPayment,
};
