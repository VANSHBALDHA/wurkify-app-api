const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const EventApplication = require("../models/EventApplication");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getEventList = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let events;

    if (user.role === "organizer") {
      events = await Event.find({ organizer_id: userId }).sort({
        createdAt: -1,
      });

      const formattedEvents = events.map((event) => ({
        event_id: event._id,
        eventName: event.eventName,
        eventDate: event.eventDate,
        shiftTime: event.shiftTime,
        dressCode: event.dressCode,
        dressCodeDescription: event.dressCodeDescription,
        paymentAmount: event.paymentAmount,
        paymentClearanceDays: event.paymentClearanceDays,
        workDescription: event.workDescription,
        location: event.location,
        requiredMemberCount: event.requiredMemberCount,
        additionalNotes: event.additionalNotes,
        eventStatus: event.eventStatus,
        organizer_name: event.organizer_name,
        createdAt: event.createdAt,
      }));

      return res.status(200).json({
        success: true,
        message: "Organizer events fetched successfully",
        total: formattedEvents.length,
        events: formattedEvents,
      });
    } else if (user.role === "seeker") {
      // 1. Get all applications for this seeker
      const applications = await EventApplication.find({ seeker_id: userId });
      const appliedEventIds = new Set(
        applications.map((app) => app.event_id.toString())
      );

      // 2. Get all pending events
      events = await Event.find({ eventStatus: "pending" }).sort({
        createdAt: -1,
      });

      // 3. Format event list with alreadyApplied flag
      const formattedEvents = events.map((event) => ({
        event_id: event._id,
        eventName: event.eventName,
        eventDate: event.eventDate,
        shiftTime: event.shiftTime,
        dressCode: event.dressCode,
        dressCodeDescription: event.dressCodeDescription,
        paymentAmount: event.paymentAmount,
        paymentClearanceDays: event.paymentClearanceDays,
        workDescription: event.workDescription,
        location: event.location,
        requiredMemberCount: event.requiredMemberCount,
        additionalNotes: event.additionalNotes,
        eventStatus: event.eventStatus,
        organizer_name: event.organizer_name,
        createdAt: event.createdAt,
        alreadyApplied: appliedEventIds.has(event._id.toString()), // ✅ new flag
      }));

      return res.status(200).json({
        success: true,
        message: "Seeker events fetched successfully",
        total: formattedEvents.length,
        events: formattedEvents,
      });
    } else {
      return res.status(403).json({
        success: false,
        message: "Only organizers and seekers can view events",
      });
    }
  } catch (err) {
    console.error("Get Event List Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getEventById = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { eventId } = req.body;

    const event = await Event.findById(eventId);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    if (user.role === "organizer" && event.organizer_id.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let alreadyApplied = false;
    if (user.role === "seeker") {
      const application = await EventApplication.findOne({
        seeker_id: userId,
        event_id: eventId,
      });
      if (application) alreadyApplied = true;
    }

    return res.status(200).json({
      success: true,
      message: "Event fetched successfully",
      event: {
        event_id: event._id,
        eventName: event.eventName,
        eventDate: event.eventDate,
        shiftTime: event.shiftTime,
        dressCode: event.dressCode,
        dressCodeDescription: event.dressCodeDescription,
        paymentAmount: event.paymentAmount,
        paymentClearanceDays: event.paymentClearanceDays,
        workDescription: event.workDescription,
        location: event.location,
        requiredMemberCount: event.requiredMemberCount,
        additionalNotes: event.additionalNotes,
        eventStatus: event.eventStatus,
        organizer_name: event.organizer_name,
        createdAt: event.createdAt,
        alreadyApplied,
      },
    });
  } catch (err) {
    console.error("Get Event By ID Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createEvent = async (req, res) => {
  try {
    const {
      eventName,
      eventDate,
      shiftTime,
      dressCode,
      dressCodeDescription,
      paymentAmount,
      paymentClearanceDays,
      workDescription,
      location,
      requiredMemberCount,
      additionalNotes,
    } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers are allowed to create events",
      });
    }

    const username = user.name;

    const eventData = {
      organizer_id: userId,
      organizer_name: username,
      eventName,
      eventDate,
      shiftTime,
      dressCode: dressCode === "Yes",
      paymentAmount,
      paymentClearanceDays,
      workDescription,
      location,
      requiredMemberCount,
      additionalNotes,
      eventStatus: "pending",
    };

    if (dressCode === "Yes") {
      if (!dressCodeDescription) {
        return res.status(400).json({
          success: false,
          message:
            "Dress code description is required when dress code is 'Yes'",
        });
      }
      eventData.dressCodeDescription = dressCodeDescription;
    }

    const newEvent = await Event.create(eventData);

    return res.status(201).json({
      success: true,
      message: "Event created successfully",
      event: newEvent,
    });
  } catch (err) {
    console.error("Create Event Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateEventStatus = async (req, res) => {
  try {
    const { eventId, status } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    if (!["pending", "completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'pending' or 'completed'",
      });
    }

    const event = await Event.findOneAndUpdate(
      { _id: eventId, organizer_id: organizerId },
      { eventStatus: status },
      { new: true }
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found or not owned by you",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Event status updated to '${status}'`,
    });
  } catch (err) {
    console.error("Update Event Status Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getRecentEvents = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access recent activity",
      });
    }

    const events = await Event.find({ organizer_id: userId })
      .sort({ createdAt: -1 })
      .limit(5);

    const formattedEvents = events.map((event) => ({
      event_id: event._id,
      eventName: event.eventName,
      eventDate: event.eventDate,
      shiftTime: event.shiftTime,
      dressCode: event.dressCode,
      dressCodeDescription: event.dressCodeDescription,
      paymentAmount: event.paymentAmount,
      paymentClearanceDays: event.paymentClearanceDays,
      workDescription: event.workDescription,
      location: event.location,
      requiredMemberCount: event.requiredMemberCount,
      additionalNotes: event.additionalNotes,
      eventStatus: event.eventStatus,
      organizer_name: event.organizer_name,
      createdAt: event.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Recent events fetched successfully",
      total: formattedEvents.length,
      events: formattedEvents,
    });
  } catch (err) {
    console.error("Get Recent Events Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteEvent = async (req, res) => {
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
        message: "Only organizers are allowed to delete events",
      });
    }

    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const deleted = await Event.findOneAndDelete({
      _id: eventId,
      organizer_id: userId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you don't have permission to delete it",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (err) {
    console.error("Delete Event Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const applyToEvent = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const seeker = await UserAuth.findById(seekerId);
    if (!seeker || seeker.role !== "seeker") {
      return res
        .status(403)
        .json({ success: false, message: "Only seekers can apply" });
    }

    const { eventId } = req.body;
    if (!eventId) {
      return res
        .status(400)
        .json({ success: false, message: "Event ID is required" });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });
    }

    const existingApplication = await EventApplication.findOne({
      seeker_id: seekerId,
      event_id: eventId,
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "You have already applied for this event",
      });
    }

    const application = await EventApplication.create({
      seeker_id: seekerId,
      event_id: eventId,
    });

    return res.status(201).json({
      success: true,
      message: "Applied to event successfully",
      application,
    });
  } catch (err) {
    console.error("Apply to Event Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getSeekerRecentActivity = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const user = await UserAuth.findById(seekerId);
    if (!user || user.role !== "seeker") {
      return res.status(403).json({
        success: false,
        message: "Only seekers can access recent activity",
      });
    }

    const applications = await EventApplication.find({ seeker_id: seekerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("event_id");

    const recentActivity = applications
      .filter((app) => app.event_id !== null)
      .map((app) => ({
        event_id: app.event_id._id,
        eventName: app.event_id.eventName,
        eventDate: app.event_id.eventDate,
        shiftTime: app.event_id.shiftTime,
        location: app.event_id.location,
        eventStatus: app.event_id.eventStatus,
        organizer_name: app.event_id.organizer_name,
        appliedAt: app.createdAt,
      }));

    return res.status(200).json({
      success: true,
      message: "Seeker recent activity fetched successfully",
      total: recentActivity.length,
      activity: recentActivity,
    });
  } catch (err) {
    console.error("Get Seeker Recent Activity Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getApplicantsByEvent = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    const user = await UserAuth.findById(organizerId);
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

    const applications = await EventApplication.find({
      event_id: eventId,
    }).populate("seeker_id", "name email phone gender birthdate role");

    const seekers = applications.map((app) => ({
      seeker_id: app.seeker_id._id,
      name: app.seeker_id.name,
      email: app.seeker_id.email,
      phone: app.seeker_id.phone,
      gender: app.seeker_id.gender,
      birthdate: app.seeker_id.birthdate,
      role: app.seeker_id.role,
      appliedAt: app.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Applicants fetched successfully",
      total: seekers.length,
      applicants: seekers,
    });
  } catch (err) {
    console.error("Get Applicants Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateApplicationStatus = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    const user = await UserAuth.findById(organizerId);
    if (!user || user.role !== "organizer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { eventId, applicationId, status } = req.body;

    if (
      !eventId ||
      !applicationId ||
      !["accepted", "rejected"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing or invalid fields (eventId, applicationId, status)",
      });
    }

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

    const application = await EventApplication.findOneAndUpdate(
      { seeker_id: applicationId, event_id: eventId },
      { applicationStatus: status },
      { new: true }
    ).populate("seeker_id", "name email");

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Application ${status} successfully`,
      updatedStatus: application.applicationStatus,
      applicant: {
        seeker_id: application.seeker_id._id,
        name: application.seeker_id.name,
        email: application.seeker_id.email,
      },
    });
  } catch (err) {
    console.error("Update Application Status Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getEventList,
  getEventById,
  createEvent,
  updateEventStatus,
  getRecentEvents,
  deleteEvent,
  applyToEvent,
  getSeekerRecentActivity,
  getApplicantsByEvent,
  updateApplicationStatus,
};
