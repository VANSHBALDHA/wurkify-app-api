const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const EventApplication = require("../models/EventApplication");
const Notification = require("../models/Notification");
const UserProfile = require("../models/UserProfile");

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

    const { eventStatus, applicationStatus } = req.query;

    let events;

    if (user.role === "organizer") {
      const query = { organizer_id: userId };
      if (eventStatus && eventStatus !== "all") {
        query.eventStatus = eventStatus;
      }

      events = await Event.find(query).sort({ createdAt: -1 });

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
      const applications = await EventApplication.find({ seeker_id: userId });

      const applicationMap = new Map();
      applications.forEach((app) => {
        applicationMap.set(app.event_id.toString(), app.applicationStatus);
      });

      const query = {};
      if (eventStatus && eventStatus !== "all") {
        query.eventStatus = eventStatus;
      }

      const events = await Event.find(query).sort({ createdAt: -1 });

      if (events.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No events found",
          total: 0,
          events: [],
        });
      }

      const formattedEvents = events.map((event) => {
        const eventId = event._id.toString();
        const appliedStatus = applicationMap.get(eventId);

        return {
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
          alreadyApplied: applicationMap.has(eventId),
          applicationStatus: appliedStatus || null,
        };
      });

      const filteredEvents = applicationStatus
        ? formattedEvents.filter(
            (event) => event.applicationStatus === applicationStatus
          )
        : formattedEvents;

      return res.status(200).json({
        success: true,
        message: "Seeker events fetched successfully",
        total: filteredEvents.length,
        events: filteredEvents,
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
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Authentication failed.",
      });
    }

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

const editEvent = async (req, res) => {
  try {
    const {
      eventId,
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
    if (!user || user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers are allowed to edit events",
      });
    }

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    const updateData = {
      eventName,
      eventDate,
      shiftTime,
      dressCode: dressCode === "Yes" || dressCode === true,
      paymentAmount,
      paymentClearanceDays,
      workDescription,
      location,
      requiredMemberCount,
      additionalNotes,
    };

    // If dressCode is true, description is required
    if (updateData.dressCode) {
      if (!dressCodeDescription) {
        return res.status(400).json({
          success: false,
          message:
            "Dress code description is required when dress code is 'Yes'",
        });
      }
      updateData.dressCodeDescription = dressCodeDescription;
    } else {
      updateData.dressCodeDescription = null;
    }

    const updatedEvent = await Event.findOneAndUpdate(
      { _id: eventId, organizer_id: userId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        message: "Event not found or you don't have permission to edit it",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Event updated successfully",
      event: updatedEvent,
    });
  } catch (err) {
    console.error("Edit Event Error:", err);
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
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
        });
      }
      throw err;
    }

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

    const totalApplied = await EventApplication.countDocuments({
      seeker_id: seekerId,
    });

    const totalAccepted = await EventApplication.countDocuments({
      seeker_id: seekerId,
      status: "accepted",
    });

    const notificationCount = await Notification.countDocuments({
      receiver_id: seekerId,
      status: "unread",
    });

    const last12Months = Array.from({ length: 12 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    });

    const graphData = await Promise.all(
      last12Months.map(async ({ month, year }) => {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        const eventsInMonth = await EventApplication.countDocuments({
          seeker_id: seekerId,
          createdAt: { $gte: start, $lt: end },
        });

        const earningsInMonthAgg = await EventApplication.aggregate([
          {
            $match: {
              seeker_id: seekerId,
              status: "accepted",
              createdAt: { $gte: start, $lt: end },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$amountPaid" },
            },
          },
        ]);

        const earningsInMonth = earningsInMonthAgg[0]?.total || 0;

        return {
          month: `${year}-${month.toString().padStart(2, "0")}`,
          events: eventsInMonth,
          earnings: earningsInMonth,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Seeker recent activity fetched successfully",
      total: recentActivity.length,
      activity: recentActivity,
      stats: {
        totalApplied,
        totalAccepted,
        notificationCount,
        graphData: graphData.reverse(), // Latest first
      },
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

    const { eventId, filter } = req.body;

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

    let query = { event_id: eventId };
    if (filter && filter !== "all") {
      query.applicationStatus = filter;
    }

    const applications = await EventApplication.find(query).populate(
      "seeker_id",
      "name email phone gender birthdate role"
    );

    const seekers = applications.map((app) => ({
      seeker_id: app.seeker_id._id,
      name: app.seeker_id.name,
      email: app.seeker_id.email,
      phone: app.seeker_id.phone,
      gender: app.seeker_id.gender,
      birthdate: app.seeker_id.birthdate,
      role: app.seeker_id.role,
      appliedAt: app.createdAt,
      updatedStatus: app.applicationStatus || "pending",
    }));

    return res.status(200).json({
      success: true,
      message: "Applicants fetched successfully",
      total: seekers?.length,
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
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Authentication failed.",
      });
    }

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

const getOrganizerDashboard = async (req, res) => {
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
      return res.status(403).json({
        success: false,
        message: "Only organizers can access the dashboard",
      });
    }

    const totalRegistered = await Event.countDocuments({
      organizer_id: organizerId,
    });
    const totalCompleted = await Event.countDocuments({
      organizer_id: organizerId,
      eventStatus: "completed",
    });
    const totalInProgress = await Event.countDocuments({
      organizer_id: organizerId,
      eventStatus: "pending",
    });

    const totalSpendAgg = await Event.aggregate([
      { $match: { organizer_id: user._id } },
      { $group: { _id: null, total: { $sum: "$paymentAmount" } } },
    ]);
    const totalSpend = totalSpendAgg[0]?.total || 0;

    const analytics = await Event.aggregate([
      { $match: { organizer_id: user._id } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$eventStatus", "completed"] }, 1, 0] },
          },
          moneySpend: { $sum: "$paymentAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const eventAnalytics = analytics.map((item) => ({
      month: `${item._id.year}-${item._id.month.toString().padStart(2, "0")}`,
      completed: item.completed,
      moneySpend: item.moneySpend,
    }));

    const recentEvents = await Event.find({ organizer_id: user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    const formattedRecentEvents = recentEvents.map((event) => ({
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
      message: "Organizer dashboard data fetched successfully",
      summary: {
        totalRegistered,
        totalCompleted,
        totalInProgress,
        totalSpend,
      },
      analytics: eventAnalytics,
      recentActivity: formattedRecentEvents,
    });
  } catch (err) {
    console.error("Organizer Dashboard Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const viewSeekerDetails = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please log in again.",
      });
    }

    const organizerId = decoded._id;
    const user = await UserAuth.findById(organizerId);
    const profile = await UserProfile.findOne({ organizerId });

    return res.status(200).json({
      success: true,
      message: "Seeker details fetched successfully",
      data: {
        user_id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthdate: user.birthdate,
        gender: user.gender,
        role: user.role,

        age: profile?.age || null,
        city: profile?.city || null,
        state: profile?.state || null,
        height: profile?.height || null,
        weight: profile?.weight || null,
        skills: profile?.skills || [],
        education: profile?.education || {},
        socialLinks: profile?.socialLinks || {
          instagram: "",
          twitter: "",
          facebook: "",
          linkedin: "",
        },
        documentation: profile?.documentation || null,
        bankDetails: profile?.bankDetails || null,
        workExperience: profile?.workExperience || [],
      },
    });
  } catch (err) {
    console.error("View Seeker Details Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getEventList,
  getEventById,
  createEvent,
  editEvent,
  updateEventStatus,
  deleteEvent,
  applyToEvent,
  getSeekerRecentActivity,
  getApplicantsByEvent,
  updateApplicationStatus,
  getOrganizerDashboard,
  viewSeekerDetails,
};
