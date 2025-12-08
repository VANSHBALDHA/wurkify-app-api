const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const AttendeeCheckin = require("../models/AttendeeCheckin");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const EventApplication = require("../models/EventApplication");
const { sendNotification } = require("../middlewares/notificationService");
const UserProfile = require("../models/UserProfile");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const { format } = require("date-fns");
const { seekerMessages } = require("../utils/seekerNotifications");
const { organizerMessages } = require("../utils/organizerNotifications");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const calculateDuration = (checkinTime, checkoutTime) => {
  if (!checkinTime || !checkoutTime) return null;
  const diffMs = new Date(checkoutTime) - new Date(checkinTime);
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return { hours, mins, totalMinutes: hours * 60 + mins };
};

const formatDateTime = (date) =>
  date ? format(new Date(date), "dd-MM-yyyy hh:mm:ss a") : null;

/* =============== CHECK-IN =============== */
const submitCheckin = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;
    const { eventId } = req.body;

    if (!eventId || !req.file)
      return res
        .status(400)
        .json({ success: false, message: "eventId & selfie required" });

    const event = await Event.findById(eventId);
    if (!event)
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });

    // upload selfie
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "attendance_checkins" },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    const checkin = await AttendeeCheckin.findOneAndUpdate(
      { eventId, userId },
      {
        $push: {
          sessions: {
            checkinSelfie: result.secure_url,
            checkinTime: new Date(),
            checkinStatus: "pending",
          },
        },
      },
      { new: true, upsert: true }
    );

    // notify organizer – can use attendanceCheckin template if you have seeker name
    const seekerName = decoded.name || "An attendee";
    const orgTemplate = organizerMessages.attendanceCheckin(
      event.eventName,
      seekerName
    );

    await sendNotification({
      sender_id: userId,
      receiver_id: event.organizer_id,
      event_id: eventId,
      type: "checkin",
      title: orgTemplate.title,
      message: orgTemplate.message,
    });

    // notify seeker – attendance verification flow
    const seekerTemplate = seekerMessages.checkinSubmitted(event.eventName);

    await sendNotification({
      sender_id: event.organizer_id,
      receiver_id: userId,
      event_id: eventId,
      type: "checkin",
      title: seekerTemplate.title,
      message: seekerTemplate.message,
    });

    res.status(201).json({
      success: true,
      message: "Check-in submitted successfully",
      checkin,
    });
  } catch (err) {
    console.error("Submit Check-in Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== CHECK-OUT =============== */
const submitCheckout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;
    const { eventId } = req.body;

    if (!eventId || !req.file)
      return res
        .status(400)
        .json({ success: false, message: "eventId & selfie required" });

    const record = await AttendeeCheckin.findOne({ eventId, userId });
    if (!record || !record.sessions.length)
      return res.status(400).json({
        success: false,
        message: "You must check-in before check-out",
      });

    const last = record.sessions[record.sessions.length - 1];
    if (last.checkoutTime)
      return res
        .status(400)
        .json({ success: false, message: "No active check-in to checkout" });
    if (last.checkinStatus !== "approved")
      return res.status(400).json({
        success: false,
        message: "Check-in must be approved before checking out",
      });

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "attendance_checkouts" },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      streamifier.createReadStream(req.file.buffer).pipe(stream);
    });

    last.checkoutSelfie = result.secure_url;
    last.checkoutTime = new Date();
    last.checkoutStatus = "pending";
    await record.save();

    const event = await Event.findById(eventId);

    // organizer – you can keep the custom text or add an organizer template later
    await sendNotification({
      sender_id: userId,
      receiver_id: event.organizer_id,
      event_id: eventId,
      type: "checkout",
      title: "New Check-out Request",
      message: `${decoded.name || "An attendee"} has checked out for "${
        event.eventName
      }" awaiting your approval.`,
    });

    // seeker – use template
    const seekerTemplate = seekerMessages.checkoutSubmitted(event.eventName);

    await sendNotification({
      sender_id: event.organizer_id,
      receiver_id: userId,
      event_id: eventId,
      type: "checkout",
      title: seekerTemplate.title,
      message: seekerTemplate.message,
    });

    res.status(201).json({
      success: true,
      message: "Check-out submitted successfully",
      attendee: record,
    });
  } catch (err) {
    console.error("Submit Checkout Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== GET MY STATUS =============== */
const getMyAttendanceStatus = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { eventId } = req.body;

    const record = await AttendeeCheckin.findOne({
      eventId,
      userId: decoded._id,
    });
    if (!record || !record.sessions.length)
      return res
        .status(404)
        .json({ success: false, message: "No attendance found" });

    const last = record.sessions[record.sessions.length - 1];
    res.status(200).json({
      success: true,
      attendance: {
        checkinStatus: last.checkinStatus,
        checkinTime: formatDateTime(last.checkinTime),
        checkoutStatus: last.checkoutStatus,
        checkoutTime: formatDateTime(last.checkoutTime),
        duration: calculateDuration(last.checkinTime, last.checkoutTime),
      },
    });
  } catch (err) {
    console.error("Get My Attendance Status Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== ORGANIZER: PENDING LIST =============== */
const getPendingAttendance = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;
    const { eventId } = req.body;

    const event = await Event.findOne({
      _id: eventId,
      organizer_id: organizerId,
    });
    if (!event)
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized event access" });

    const records = await AttendeeCheckin.find({ eventId }).populate(
      "userId",
      "name email"
    );

    const pending = [];
    for (const r of records) {
      const profile = await UserProfile.findOne({
        userId: r.userId._id,
      }).select("profile_img");
      for (const s of r.sessions) {
        if (s.checkinStatus === "pending" || s.checkoutStatus === "pending") {
          pending.push({
            recordId: r._id,
            user: {
              _id: r.userId._id,
              name: r.userId.name,
              email: r.userId.email,
              profile_img: profile?.profile_img || null,
            },
            sessionId: s._id,
            checkinTime: formatDateTime(s.checkinTime),
            checkoutTime: formatDateTime(s.checkoutTime),
            checkinSelfie: s.checkinSelfie,
            checkoutSelfie: s.checkoutSelfie,
            checkinStatus: s.checkinStatus,
            checkoutStatus: s.checkoutStatus,
            duration: calculateDuration(s.checkinTime, s.checkoutTime),
          });
        }
      }
    }

    res.status(200).json({ success: true, records: pending });
  } catch (err) {
    console.error("Get Pending Attendance Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== APPROVE / REJECT =============== */
const updateAttendanceStatus = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { recordId, sessionId, type, status } = req.body;

    const record = await AttendeeCheckin.findOneAndUpdate(
      { _id: recordId, "sessions._id": sessionId },
      { $set: { [`sessions.$.${type}Status`]: status } },
      { new: true }
    ).populate("userId", "name email");

    if (!record)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    const event = await Event.findById(record.eventId);

    let template;

    if (type === "checkin") {
      template =
        status === "approved"
          ? seekerMessages.checkinApproved(event.eventName)
          : seekerMessages.checkinRejected(event.eventName);
    } else if (type === "checkout") {
      template =
        status === "approved"
          ? seekerMessages.checkoutApproved(event.eventName)
          : seekerMessages.checkoutRejected(event.eventName);
    }

    await sendNotification({
      sender_id: decoded._id,
      receiver_id: record.userId._id,
      event_id: event._id,
      type: "attendance",
      title: template.title,
      message: template.message,
    });

    res.status(200).json({
      success: true,
      message: `${type} ${status}`,
      record,
    });
  } catch (err) {
    console.error("Update Attendance Status Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== SEEKER: ACCEPTED EVENTS =============== */
const getAcceptedEventList = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const applications = await EventApplication.find({
      seeker_id: decoded._id,
      applicationStatus: "accepted",
    }).populate("event_id", "eventName location eventStatus");

    res.status(200).json({
      success: true,
      events: applications.map((a) => ({
        event_id: a.event_id?._id,
        eventName: a.event_id?.eventName,
        location: a.event_id?.location,
        eventStatus: a.event_id?.eventStatus,
        appliedAt: a.appliedAt,
      })),
    });
  } catch (err) {
    console.error("Get Accepted Event List Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* =============== SEEKER: MY TIMESHEET =============== */
const getMyTimesheet = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { eventId } = req.body;

    const record = await AttendeeCheckin.findOne({
      eventId,
      userId: decoded._id,
    });

    if (!record)
      return res
        .status(200)
        .json({ success: false, message: "No attendance found" });

    const timesheet = record.sessions.map((s) => ({
      checkinTime: formatDateTime(s.checkinTime),
      checkoutTime: formatDateTime(s.checkoutTime),
      checkinStatus: s.checkinStatus,
      checkoutStatus: s.checkoutStatus,
      checkinSelfie: s.checkinSelfie || null,
      checkoutSelfie: s.checkoutSelfie || null,
      totalHours:
        s.checkinTime && s.checkoutTime
          ? (
              (new Date(s.checkoutTime) - new Date(s.checkinTime)) /
              3600000
            ).toFixed(2)
          : "0.00",
    }));

    res.status(200).json({
      success: true,
      timesheet,
    });
  } catch (err) {
    console.error("Get My Timesheet Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  submitCheckin,
  submitCheckout,
  getMyAttendanceStatus,
  getPendingAttendance,
  updateAttendanceStatus,
  getAcceptedEventList,
  getMyTimesheet,
};
