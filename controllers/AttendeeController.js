const jwt = require("jsonwebtoken");
const AttendeeCheckin = require("../models/AttendeeCheckin");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const { format } = require("date-fns");
const EventApplication = require("../models/EventApplication");

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

    // const base64Image = req.file.buffer.toString("base64");
    // const mimeType = req.file.mimetype;

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
        checkinSelfie: imageUrl,
        checkinTime: new Date(),
        checkinStatus: "pending",
      },
      { new: true, upsert: true }
    );

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

    // const base64Image = req.file.buffer.toString("base64");
    // const mimeType = req.file.mimetype;

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

    const attendee = await AttendeeCheckin.findOneAndUpdate(
      { eventId, userId },
      {
        checkoutSelfie: imageUrl,
        checkoutTime: new Date(),
        checkoutStatus: "pending",
      },
      { new: true }
    );

    if (!attendee) {
      return res.status(400).json({
        success: false,
        message: "You must check-in before check-out",
      });
    }

    res.status(201).json({
      success: true,
      message: "Check-out submitted, waiting for organizer approval",
      attendee,
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

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "No attendance found" });
    }

    res.status(200).json({
      success: true,
      attendance: {
        checkinStatus: record.checkinStatus,
        checkinTime: formatDateTime(record.checkinTime),
        checkoutStatus: record.checkoutStatus,
        checkoutTime: formatDateTime(record.checkoutTime),
        duration: calculateDuration(record.checkinTime, record.checkoutTime),
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
    const records = await AttendeeCheckin.find({
      eventId,
      $or: [{ checkinStatus: "pending" }, { checkoutStatus: "pending" }],
    }).populate("userId", "name email");

    res.status(200).json({
      success: true,
      records: records.map((r) => ({
        ...r.toObject(),
        duration: calculateDuration(r.checkinTime, r.checkoutTime),
      })),
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

    const { recordId, type, status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Status must be approved/rejected" });
    }

    let updateField = {};
    if (type === "checkin") updateField.checkinStatus = status;
    else if (type === "checkout") updateField.checkoutStatus = status;
    else
      return res
        .status(400)
        .json({ success: false, message: "Invalid type provided" });

    const record = await AttendeeCheckin.findByIdAndUpdate(
      recordId,
      updateField,
      { new: true }
    ).populate("userId", "name email");

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "Attendance record not found" });
    }

    res.status(200).json({
      success: true,
      message: `${type} ${status}`,
      record: {
        ...record.toObject(),
        duration: calculateDuration(record.checkinTime, record.checkoutTime),
      },
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
    }).populate("event_id", "eventName location");

    if (!applications || applications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No accepted events found",
      });
    }

    console.log("applications", applications);

    res.status(200).json({
      success: true,
      events: applications.map((app) => ({
        event_id: app.event_id?._id,
        seeker_id: app.seeker_id,
        eventName: app.event_id?.eventName,
        location: app.event_id?.location,
        applicationStatus: app.applicationStatus,
        appliedAt: formatDateTime(app.appliedAt),
      })),
    });
  } catch (err) {
    console.error("Get Accepted Event List Error:", err);
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
};
