const jwt = require("jsonwebtoken");
const AttendeeCheckin = require("../models/AttendeeCheckin");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const { format } = require("date-fns");
const EventApplication = require("../models/EventApplication");
const { sendNotification } = require("../middlewares/notificationService");

const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const calculateDuration = (checkinTime, checkoutTime) => {
  if (!checkinTime || !checkoutTime) return null;
  const diffMs = new Date(checkoutTime) - new Date(checkinTime);
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return { hours, mins, totalMinutes: diffMins };
};

const formatDateTime = (date) => {
  if (!date) return null;
  return format(new Date(date), "dd-MM-yyyy hh:mm:ss a");
};

const submitCheckin = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { eventId } = req.body;
    if (!eventId || !req.file) {
      return res.status(400).json({
        success: false,
        message: "eventId & checkinSelfie are required",
      });
    }

    const event = await Event.findById(eventId);
    if (!event)
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });

    let imageUrl = null;
    if (req.file) {
      const streamUpload = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "profile_images", resource_type: "image" },
            (error, result) => {
              if (result) {
                resolve(result);
              } else {
                reject(error);
              }
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };

      const result = await streamUpload();
      imageUrl = result.secure_url;
    }

    const checkin = await AttendeeCheckin.findOneAndUpdate(
      { eventId, userId },
      {
        $push: {
          sessions: {
            checkinSelfie: imageUrl,
            checkinTime: new Date(),
            checkinStatus: "pending",
          },
        },
      },
      { new: true, upsert: true }
    );

    await sendNotification({
      sender_id: userId,
      receiver_id: event.organizer_id._id,
      event_id: eventId,
      type: "event",
      title: "New Check-in Request",
      message: `${decoded.name || "An attendee"} has checked in for "${
        event.eventName
      }" and is waiting for your approval.`,
    });

    await sendNotification({
      sender_id: event.organizer_id._id,
      receiver_id: userId,
      event_id: eventId,
      type: "event",
      title: "Check-in Submitted",
      message: `Your check-in for "${event.eventName}" has been submitted and is waiting for organizer approval.`,
    });

    res.status(201).json({
      success: true,
      message: "Check-in submitted, waiting for organizer approval",
      checkin,
    });
  } catch (err) {
    console.error("Submit Check-in Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const submitCheckout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { eventId } = req.body;
    if (!eventId || !req.file) {
      return res.status(400).json({
        success: false,
        message: "eventId & checkoutSelfie are required",
      });
    }

    // Upload image to Cloudinary
    let imageUrl = null;
    if (req.file) {
      const streamUpload = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "profile_images", resource_type: "image" },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });
      };
      const result = await streamUpload();
      imageUrl = result.secure_url;
    }

    // Find the last open session manually
    const record = await AttendeeCheckin.findOne({ eventId, userId });
    if (!record || record.sessions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "You must check-in before check-out",
      });
    }

    const lastSession = record.sessions[record.sessions.length - 1];
    if (lastSession.checkoutTime) {
      return res.status(400).json({
        success: false,
        message: "No active check-in found to checkout",
      });
    }

    // Update last session
    lastSession.checkoutSelfie = imageUrl;
    lastSession.checkoutTime = new Date();
    lastSession.checkoutStatus = "pending";

    await record.save();

    const event = await Event.findById(eventId).populate(
      "organizer_id",
      "_id name"
    );

    await sendNotification({
      sender_id: userId,
      receiver_id: event.organizer_id._id,
      event_id: eventId,
      type: "event",
      title: "New Check-out Request",
      message: `${decoded.name || "An attendee"} has checked out for "${
        event.eventName
      }" and is waiting for your approval.`,
    });

    // To Seeker
    await sendNotification({
      sender_id: event.organizer_id._id,
      receiver_id: userId,
      event_id: eventId,
      type: "event",
      title: "Check-out Submitted",
      message: `Your check-out for "${event.eventName}" has been submitted and is waiting for organizer approval.`,
    });

    res.status(201).json({
      success: true,
      message: "Check-out submitted, waiting for organizer approval",
      attendee: record,
    });
  } catch (err) {
    console.error("Submit Checkout Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMyAttendanceStatus = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "eventId is required",
      });
    }

    const record = await AttendeeCheckin.findOne({ eventId, userId });
    if (!record || record.sessions.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No attendance found" });
    }

    const lastSession = record.sessions[record.sessions.length - 1];

    res.status(200).json({
      success: true,
      attendance: {
        checkinStatus: lastSession.checkinStatus,
        checkinTime: formatDateTime(lastSession.checkinTime),
        checkoutStatus: lastSession.checkoutStatus,
        checkoutTime: formatDateTime(lastSession.checkoutTime),
        duration: calculateDuration(
          lastSession.checkinTime,
          lastSession.checkoutTime
        ),
      },
    });
  } catch (err) {
    console.error("Get My Attendance Status Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getPendingAttendance = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    const user = await UserAuth.findById(organizerId);
    if (!user || user.role !== "organizer") {
      return res
        .status(403)
        .json({ success: false, message: "Only organizers allowed" });
    }

    const { eventId } = req.body;

    // Get all attendance records and populate user basic details
    const records = await AttendeeCheckin.find({ eventId }).populate(
      "userId",
      "name email"
    );

    const pending = [];
    for (const r of records) {
      // Fetch user profile to get profile_img
      const profile = await UserProfile.findOne({
        userId: r.userId._id,
      }).select("profile_img");

      r.sessions.forEach((s) => {
        if (s.checkinStatus === "pending" || s.checkoutStatus === "pending") {
          pending.push({
            recordId: r._id,
            user: {
              _id: r.userId._id,
              name: r.userId.name,
              email: r.userId.email,
              profile_img: profile?.profile_img || null, // ✅ added here
            },
            sessionId: s._id,
            checkinTime: formatDateTime(s.checkinTime),
            checkoutTime: formatDateTime(s.checkoutTime),
            checkinStatus: s.checkinStatus,
            checkoutStatus: s.checkoutStatus,
            checkinSelfie: s.checkinSelfie || null,
            checkoutSelfie: s.checkoutSelfie || null,
            duration: calculateDuration(s.checkinTime, s.checkoutTime),
          });
        }
      });
    }

    res.status(200).json({
      success: true,
      records: pending,
    });
  } catch (err) {
    console.error("Get Pending Attendance Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateAttendanceStatus = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    const user = await UserAuth.findById(organizerId);
    if (!user || user.role !== "organizer") {
      return res
        .status(403)
        .json({ success: false, message: "Only organizers allowed" });
    }

    const { recordId, sessionId, type, status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Status must be approved/rejected" });
    }

    let updateField = {};
    if (type === "checkin") updateField["sessions.$.checkinStatus"] = status;
    else if (type === "checkout")
      updateField["sessions.$.checkoutStatus"] = status;
    else
      return res.status(400).json({ success: false, message: "Invalid type" });

    const record = await AttendeeCheckin.findOneAndUpdate(
      { _id: recordId, "sessions._id": sessionId },
      { $set: updateField },
      { new: true }
    ).populate("userId", "name email");

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Attendance record not found" });
    }

    const event = await Event.findById(record.eventId).select("eventName");
    await sendNotification({
      sender_id: organizerId,
      receiver_id: record.userId._id,
      event_id: record.eventId,
      type: "event",
      title: "Attendance Update",
      message: `Your ${type} for "${event.eventName}" has been ${status}.`,
    });

    await sendNotification({
      sender_id: record.userId._id,
      receiver_id: organizerId,
      event_id: record.eventId,
      type: "event",
      title: "Attendance Action Recorded",
      message: `You have ${status} the ${type} request of ${record.userId.name} for "${event.eventName}".`,
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

const getAcceptedEventList = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    // Find accepted applications
    const applications = await EventApplication.find({
      seeker_id: userId,
      applicationStatus: "accepted",
    }).populate("event_id", "eventName location eventStatus");

    if (!applications || applications.length === 0) {
      return res.status(200).json({
        success: false,
        message: "No accepted events found",
      });
    }

    res.status(200).json({
      success: true,
      events: applications.map((app) => ({
        event_id: app.event_id?._id,
        seeker_id: app.seeker_id,
        eventName: app.event_id?.eventName,
        location: app.event_id?.location,
        applicationStatus: app.applicationStatus,
        appliedAt: formatDateTime(app.appliedAt),
        eventStatus: app.event_id?.eventStatus,
      })),
    });
  } catch (err) {
    console.error("Get Accepted Event List Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMyTimesheet = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { eventId } = req.body;
    if (!eventId) {
      return res
        .status(400)
        .json({ success: false, message: "eventId is required" });
    }

    const record = await AttendeeCheckin.findOne({ eventId, userId });
    if (!record || record.sessions.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No attendance found" });
    }

    // Build timesheet list with statuses
    const timesheet = record.sessions.map((s) => ({
      clock_in: s.checkinTime,
      clock_out: s.checkoutTime || null,
      checkin_status: s.checkinStatus,
      checkout_status: s.checkoutStatus,
      checkin_selfie: s.checkinSelfie || null,
      checkout_selfie: s.checkoutSelfie || null,
      total_hours:
        s.checkinTime && s.checkoutTime
          ? (
              (new Date(s.checkoutTime) - new Date(s.checkinTime)) /
              3600000
            ).toFixed(2)
          : "0.00",
    }));

    const lastSession = record.sessions[record.sessions.length - 1];
    const status = lastSession.checkoutTime ? "checkout" : "checkin";

    res.status(200).json({
      status,
      timesheet,
    });
  } catch (err) {
    console.error("Get Attendance Timesheet Error:", err);
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
