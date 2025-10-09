const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const EventApplication = require("../models/EventApplication");
const UserAuth = require("../models/AuthUsers");
const mongoose = require("mongoose");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

/**
 * Organizer: Fetch all events with payment summary
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
 * This API will be called after payment success in Flutter app.
 */
const updatePaymentStatus = async (req, res) => {
  try {
    const { eventId, seekerId, paymentId, amount } = req.body;

    if (!eventId || !seekerId || !paymentId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });
    }

    // ✅ Convert to ObjectId to avoid type mismatch
    const eventObjectId = new mongoose.Types.ObjectId(eventId);
    const seekerObjectId = new mongoose.Types.ObjectId(seekerId);

    // ✅ Ensure event exists
    const event = await Event.findById(eventObjectId);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    // ✅ Try to update existing application
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
      { new: true }
    );

    // ✅ If no record exists, create one
    if (!application) {
      application = new EventApplication({
        event_id: eventObjectId,
        seeker_id: seekerObjectId,
        paymentStatus: "completed",
        razorpay_payment_id: paymentId,
        paymentAmount: amount || event.paymentAmount,
        paymentReceivedAt: new Date(),
      });
      await application.save();
    }

    return res.status(200).json({
      success: true,
      message: "Payment stored successfully",
      data: application,
    });
  } catch (err) {
    console.error("Update Payment Status Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getPaymentEventList,
  getEventUserPayments,
  updatePaymentStatus,
};
