const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const EventApplication = require("../models/EventApplication");
const Notification = require("../models/Notification");
const UserProfile = require("../models/UserProfile");
const Group = require("../models/Group");
const { io, onlineUsers } = require("../server");
const moment = require("moment");
const { sendNotification } = require("../middlewares/notificationService");
const { checkProfileCompletion } = require("../utils/profileValidator");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const formatDMY = (value) => {
  if (!value) return null;

  if (typeof value === "string") {
    const dmy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return value;
  }

  let d;
  if (value instanceof Date) {
    d = new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())
    );
  } else if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, day));
  } else {
    const parsed = new Date(value);
    if (isNaN(parsed)) return null;
    d = new Date(
      Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    );
  }

  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

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

    // ✅ Normalize query params
    const eventStatus =
      req.query.eventStatus && req.query.eventStatus !== "all"
        ? req.query.eventStatus.toLowerCase()
        : null;

    const applicationStatus = req.query.applicationStatus || null;

    let events;

    if (user.role === "organizer") {
      // ✅ Build query safely
      const query = { organizer_id: userId };
      if (eventStatus) {
        query.eventStatus = eventStatus;
      }

      console.log("Organizer Event Query:", query);

      events = await Event.find(query).sort({ createdAt: -1 });

      // ✅ Fix for missing eventStatus (older events)
      const missingStatus = events.filter((e) => !e.eventStatus);
      if (missingStatus.length > 0) {
        await Promise.all(
          missingStatus.map((e) => {
            e.eventStatus = "pending";
            return e.save();
          })
        );
      }

      const eventIds = events.map((e) => e._id);

      const applications = await EventApplication.aggregate([
        { $match: { event_id: { $in: eventIds } } },
        { $group: { _id: "$event_id", count: { $sum: 1 } } },
      ]);

      const appCountMap = new Map(
        applications.map((a) => [a._id.toString(), a.count])
      );

      const formattedEvents = await Promise.all(
        events.map(async (event) => {
          const organizerProfile = await UserProfile.findOne(
            { userId: event.organizer_id },
            "profile_img"
          );

          return {
            event_id: event._id,
            eventName: event.eventName,
            startDate: event.startDate,
            endDate: event.endDate,
            numberOfDays: event.numberOfDays,
            shiftTime: event.shiftTime,
            dailyStartTime: event.dailyStartTime,
            dailyEndTime: event.dailyEndTime,
            dressCode: event.dressCode,
            dressCodeDescription: event.dressCodeDescription,
            paymentAmount: event.paymentAmount,
            paymentClearanceDays: event.paymentClearanceDays,
            workDescription: event.workDescription,
            location: event.location,
            requiredMemberCount: event.requiredMemberCount,
            additionalNotes: event.additionalNotes,
            eventStatus: event.eventStatus || "pending",
            organizer_name: event.organizer_name,
            organizer_img: organizerProfile
              ? organizerProfile.profile_img
              : null,
            createdAt: event.createdAt,
            appliedCount: appCountMap.get(event._id.toString()) || 0,
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: "Organizer events fetched successfully",
        total: formattedEvents.length,
        events: formattedEvents,
      });
    }
    // ✅ SEEKER LOGIC
    else if (user.role === "seeker") {
      const applications = await EventApplication.find({ seeker_id: userId });
      const applicationMap = new Map();
      applications.forEach((app) => {
        applicationMap.set(app.event_id.toString(), app.applicationStatus);
      });

      const query = { eventStatus: { $ne: "completed" } };
      if (eventStatus && eventStatus !== "all") {
        query.eventStatus = eventStatus.toLowerCase();
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

      // ✅ Fix for missing eventStatus (older events)
      const missingStatus = events.filter((e) => !e.eventStatus);
      if (missingStatus.length > 0) {
        await Promise.all(
          missingStatus.map((e) => {
            e.eventStatus = "pending";
            return e.save();
          })
        );
      }

      const eventIds = events.map((e) => e._id);

      const appCounts = await EventApplication.aggregate([
        { $match: { event_id: { $in: eventIds } } },
        { $group: { _id: "$event_id", count: { $sum: 1 } } },
      ]);

      const appCountMap = new Map(
        appCounts.map((a) => [a._id.toString(), a.count])
      );

      const formattedEvents = await Promise.all(
        events.map(async (event) => {
          const eventId = event._id.toString();
          const appliedStatus = applicationMap.get(eventId);
          const organizerProfile = await UserProfile.findOne(
            { userId: event.organizer_id },
            "profile_img"
          );

          return {
            event_id: event._id,
            eventName: event.eventName,
            startDate: event.startDate,
            endDate: event.endDate,
            numberOfDays: event.numberOfDays,
            shiftTime: event.shiftTime,
            dailyStartTime: event.dailyStartTime,
            dailyEndTime: event.dailyEndTime,
            dressCode: event.dressCode,
            dressCodeDescription: event.dressCodeDescription,
            paymentAmount: event.paymentAmount,
            paymentClearanceDays: event.paymentClearanceDays,
            workDescription: event.workDescription,
            location: event.location,
            requiredMemberCount: event.requiredMemberCount,
            additionalNotes: event.additionalNotes,
            eventStatus: event.eventStatus || "pending",
            organizer_name: event.organizer_name,
            organizer_img: organizerProfile
              ? organizerProfile.profile_img
              : null,
            createdAt: event.createdAt,
            alreadyApplied: applicationMap.has(eventId),
            applicationStatus: appliedStatus || null,
            appliedCount: appCountMap.get(eventId) || 0,
          };
        })
      );

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
        startDate: event.startDate,
        endDate: event.endDate,
        numberOfDays: event.numberOfDays,
        shiftTime: event.shiftTime,
        dailyStartTime: event.dailyStartTime,
        dailyEndTime: event.dailyEndTime,
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
      startDate,
      endDate,
      dailyStartTime,
      dailyEndTime,
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

    // ✅ Properly declare variables
    let parsedStartDate = null;
    let parsedEndDate = null;

    // Validate and parse startDate
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: "startDate is required",
      });
    }
    const start = moment(startDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
    if (!start.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format. Use DD-MM-YYYY or YYYY-MM-DD",
      });
    }
    parsedStartDate = start.toDate();

    // Validate and parse endDate
    if (!endDate) {
      return res.status(400).json({
        success: false,
        message: "endDate is required",
      });
    }
    const end = moment(endDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
    if (!end.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format. Use DD-MM-YYYY or YYYY-MM-DD",
      });
    }
    parsedEndDate = end.toDate();

    // ✅ Sanity check: endDate cannot be before startDate
    if (parsedEndDate < parsedStartDate) {
      return res.status(400).json({
        success: false,
        message: "endDate cannot be before startDate",
      });
    }

    let computedPaymentClearanceDays = 0;

    if (typeof paymentClearanceDays === "string") {
      const value = paymentClearanceDays.toLowerCase().trim();

      if (value === "spot pay") {
        computedPaymentClearanceDays = 1;
      } else if (value === "within 1 week") {
        computedPaymentClearanceDays = 7;
      } else if (value === "within 2 weeks") {
        computedPaymentClearanceDays = 14;
      } else if (value.startsWith("other")) {
        isOtherSelected = true;
        const match = value.match(/(\d+)/);
        computedPaymentClearanceDays = match ? parseInt(match[1], 10) : 0;
      } else {
        computedPaymentClearanceDays = Number(value) || 0;
      }
    } else if (typeof paymentClearanceDays === "number") {
      computedPaymentClearanceDays = paymentClearanceDays;
    }

    const eventData = {
      organizer_id: userId,
      organizer_name: username,
      eventName,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      dailyStartTime,
      dailyEndTime,
      shiftTime: shiftTime
        ? `${shiftTime} ${shiftTime == 1 ? "Hour" : "Hours"}`
        : null,
      dressCode:
        typeof dressCode === "string"
          ? dressCode.toLowerCase() === "yes"
          : !!dressCode,
      paymentAmount,
      paymentClearanceDays: computedPaymentClearanceDays,
      workDescription,
      location,
      requiredMemberCount,
      additionalNotes,
      eventStatus: "pending",
      numberOfDays: Math.floor(
        (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24)
      ),
    };

    if (eventData.dressCode) {
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
      startDate,
      endDate,
      dailyStartTime,
      dailyEndTime,
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

    // ✅ Authorization
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
      return res
        .status(400)
        .json({ success: false, message: "Event ID is required" });
    }

    // ✅ Date validations
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    let parsedStartDate = null;
    let parsedEndDate = null;

    const startMoment = moment(startDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
    const endMoment = moment(endDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);

    if (!startMoment.isValid() || !endMoment.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Please use DD-MM-YYYY or YYYY-MM-DD",
      });
    }

    parsedStartDate = startMoment.toDate();
    parsedEndDate = endMoment.toDate();

    if (parsedEndDate < parsedStartDate) {
      return res.status(400).json({
        success: false,
        message: "endDate cannot be before startDate",
      });
    }

    const numberOfDays = Math.floor(
      (parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24)
    );

    let computedPaymentClearanceDays = 0;
    let isOtherSelected = false;

    if (typeof paymentClearanceDays === "string") {
      const value = paymentClearanceDays.toLowerCase().trim();

      if (value === "spot pay") {
        computedPaymentClearanceDays = 1;
      } else if (value === "within 1 week") {
        computedPaymentClearanceDays = 7;
      } else if (value === "within 2 weeks") {
        computedPaymentClearanceDays = 14;
      } else if (value.startsWith("other")) {
        isOtherSelected = true;
        const match = value.match(/(\d+)/);
        computedPaymentClearanceDays = match ? parseInt(match[1], 10) : 0;
      } else {
        computedPaymentClearanceDays = Number(value) || 0;
      }
    } else if (typeof paymentClearanceDays === "number") {
      computedPaymentClearanceDays = paymentClearanceDays;
    }

    // ✅ Build update object
    const updateData = {
      eventName,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      numberOfDays,
      dailyStartTime,
      dailyEndTime,
      shiftTime: shiftTime
        ? `${shiftTime} ${shiftTime == 1 ? "Hour" : "Hours"}`
        : null,
      dressCode:
        typeof dressCode === "string"
          ? dressCode.toLowerCase() === "yes"
          : !!dressCode,
      paymentAmount,
      paymentClearanceDays: computedPaymentClearanceDays,
      workDescription,
      location,
      requiredMemberCount,
      additionalNotes,
      eventStatus: "pending",
    };

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

    // ✅ Update event
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
      event: {
        event_id: updatedEvent._id,
        eventName: updatedEvent.eventName,
        startDate: formatDMY(updatedEvent.startDate),
        endDate: formatDMY(updatedEvent.endDate),
        numberOfDays: updatedEvent.numberOfDays,
        shiftTime: updatedEvent.shiftTime,
        dailyStartTime: updatedEvent.dailyStartTime,
        dailyEndTime: updatedEvent.dailyEndTime,
        dressCode: updatedEvent.dressCode,
        dressCodeDescription: updatedEvent.dressCodeDescription,
        paymentAmount: updatedEvent.paymentAmount,
        paymentClearanceDays: updatedEvent.paymentClearanceDays,
        workDescription: updatedEvent.workDescription,
        location: updatedEvent.location,
        requiredMemberCount: updatedEvent.requiredMemberCount,
        additionalNotes: updatedEvent.additionalNotes,
        eventStatus: updatedEvent.eventStatus,
        organizer_name: updatedEvent.organizer_name,
        createdAt: updatedEvent.createdAt,
      },
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

    // ✅ Check if event exists and belongs to organizer
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

    // ✅ Only allow completion if all seeker payments are done
    if (status === "completed") {
      const applications = await EventApplication.find({ event_id: eventId });

      if (!applications.length) {
        return res.status(400).json({
          success: false,
          message: "No seekers applied to this event yet.",
        });
      }

      const totalApplications = applications.length;
      const paidApplications = applications.filter(
        (app) =>
          app.paymentStatus === "completed" || app.paymentStatus === "credited"
      ).length;

      if (paidApplications < totalApplications) {
        return res.status(400).json({
          success: false,
          message:
            "You cannot mark this event as completed until all seeker payments are completed.",
          pendingPayments: totalApplications - paidApplications,
          totalSeekers: totalApplications,
          paidSeekers: paidApplications,
        });
      }

      // ✅ All payments completed — proceed to mark as completed
      event.eventStatus = "completed";
      await event.save();

      // ✅ Optional: Delete group & notify seekers
      const deletedGroup = await Group.findOneAndDelete({ event_id: eventId });
      if (deletedGroup) {
        console.log(`🗑️ Group deleted for completed event: ${event.eventName}`);
      }

      const acceptedApps = applications.filter(
        (a) => a.applicationStatus === "accepted"
      );
      for (const app of acceptedApps) {
        await sendNotification({
          sender_id: organizerId,
          receiver_id: app.seeker_id,
          event_id: eventId,
          type: "group-delete",
          title: "Event Completed",
          message: `The event "${event.eventName}" has been completed. The event group has now been closed.`,
        });
      }

      return res.status(200).json({
        success: true,
        message: `Event marked as completed successfully.`,
        eventStatus: "completed",
      });
    }

    // ✅ For 'pending' status (or revert)
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: eventId, organizer_id: organizerId },
      { eventStatus: status },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: `Event status updated to '${status}'`,
      eventStatus: updatedEvent.eventStatus,
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

    const deletedGroup = await Group.findOneAndDelete({ event_id: eventId });

    return res.status(200).json({
      success: true,
      message: `Event deleted successfully${
        deletedGroup ? " and its group removed" : ""
      }`,
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

    const seekerProfile = await UserProfile.findOne({ userId: seekerId });
    const { isComplete, missingFields } = checkProfileCompletion(
      seeker,
      seekerProfile
    );

    if (!isComplete) {
      return res.status(400).json({
        success: false,
        message: "Please complete your profile before applying to events",
        missingFields,
      });
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

    await sendNotification({
      sender_id: seekerId,
      receiver_id: event.organizer_id,
      event_id: eventId,
      type: "event",
      title: "New Application",
      message: `${seeker.name} has applied for your event: ${event.eventName}`,
    });

    await sendNotification({
      sender_id: event.organizer_id, // organizer is sender
      receiver_id: seekerId, // seeker is receiver
      event_id: eventId,
      type: "event",
      title: "Application Submitted",
      message: `You have successfully applied to "${event.eventName}". Please wait for organizer's response.`,
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

    const applicants = await Promise.all(
      applications.map(async (app) => {
        const seekerProfile = await UserProfile.findOne(
          { userId: app.seeker_id._id },
          "profile_img"
        );

        return {
          seeker_id: app.seeker_id._id,
          name: app.seeker_id.name,
          email: app.seeker_id.email,
          phone: app.seeker_id.phone,
          gender: app.seeker_id.gender,
          birthdate: app.seeker_id.birthdate,
          role: app.seeker_id.role,
          appliedAt: app.createdAt,
          updatedStatus: app.applicationStatus || "pending",
          profile_img: seekerProfile ? seekerProfile.profile_img : null, // ✅ add profile image
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Applicants fetched successfully",
      total: applicants?.length,
      applicants: applicants,
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

    if (status === "accepted") {
      let group = await Group.findOne({ event_id: eventId });

      if (!group) {
        group = await Group.create({
          event_id: eventId,
          organizer_id: organizerId,
          members: [organizerId, applicationId],
        });
      } else {
        if (!group.members.includes(applicationId)) {
          group.members.push(applicationId);
          await group.save();
        }
      }

      if (global.onlineUsers instanceof Map) {
        const applicantSocket = global.onlineUsers.get(
          applicationId.toString()
        );
        if (applicantSocket) {
          global.io.to(applicantSocket).emit("notification", {
            type: "group-join",
            message: `🎉 You have been added to event group: ${event.eventName}`,
            eventId: eventId,
            groupId: group._id,
          });
        }
      }
    }

    if (status === "rejected") {
      const group = await Group.findOne({ event_id: eventId });
      if (group && group.members.includes(applicationId)) {
        group.members = group.members.filter(
          (memberId) => memberId.toString() !== applicationId.toString()
        );
        await group.save();

        // ✅ Notify the seeker
        await sendNotification({
          sender_id: organizerId,
          receiver_id: applicationId,
          event_id: eventId,
          type: "group-remove",
          title: "Removed from Event Group",
          message: `You have been removed from the event group "${event.eventName}" because your application was rejected.`,
        });

        console.log(
          `🚫 Seeker ${applicationId} removed from group for event ${event.eventName}`
        );
      }
    }

    await sendNotification({
      sender_id: organizerId,
      receiver_id: applicationId,
      event_id: eventId,
      type: "event",
      title: "Application Update",
      message: `Your application for "${event.eventName}" has been ${status}`,
    });

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

const getSeekerEvents = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    // Validate seeker role
    const user = await UserAuth.findById(seekerId);
    if (!user || user.role !== "seeker") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied (seeker only)" });
    }

    // Query param: applied | accepted
    const { type } = req.body;
    let filter = { seeker_id: seekerId };

    if (type === "accepted") {
      filter.applicationStatus = "accepted";
    }

    // Fetch events
    const applications = await EventApplication.find(filter)
      .sort({ createdAt: -1 })
      .populate("event_id");

    if (!applications.length) {
      return res.status(200).json({
        success: true,
        message: `No ${type || "applied"} events found`,
        total: 0,
        events: [],
      });
    }

    // Format response
    const formatted = applications.map((app) => ({
      event_id: app.event_id?._id,
      eventName: app.event_id?.eventName,
      location: app.event_id?.location,
      startDate: app.event_id?.startDate,
      endDate: app.event_id?.endDate,
      paymentAmount: app.event_id?.paymentAmount,
      eventStatus: app.event_id?.eventStatus,
      applicationStatus: app.applicationStatus || "pending",
      paymentStatus: app.paymentStatus || "unpaid",
      appliedAt: app.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: `${
        type === "accepted" ? "Accepted" : "Applied"
      } events fetched successfully`,
      total: formatted.length,
      events: formatted,
    });
  } catch (err) {
    console.error("getSeekerEvents Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getSeekerTotalEarnings = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const seekerId = decoded._id;

    const user = await UserAuth.findById(seekerId);
    if (!user || user.role !== "seeker") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied (seeker only)" });
    }

    // ✅ Find only paid/completed applications
    const paidApplications = await EventApplication.find({
      seeker_id: seekerId,
      paymentStatus: { $in: ["completed", "credited"] },
    })
      .populate("event_id", [
        "eventName",
        "location",
        "startDate",
        "endDate",
        "paymentAmount",
        "organizer_name",
        "eventStatus",
      ])
      .sort({ createdAt: -1 });

    if (!paidApplications.length) {
      return res.status(200).json({
        success: true,
        message: "No earnings found",
        totalEarnings: 0,
        totalEvents: 0,
        events: [],
      });
    }

    // ✅ Format response with event details
    const events = paidApplications.map((app) => ({
      event_id: app.event_id?._id,
      eventName: app.event_id?.eventName,
      location: app.event_id?.location,
      startDate: app.event_id?.startDate,
      endDate: app.event_id?.endDate,
      organizer_name: app.event_id?.organizer_name,
      eventStatus: app.event_id?.eventStatus,
      paymentAmount: app.event_id?.paymentAmount || 0,
      paymentStatus: app.paymentStatus,
      creditedAt: app.updatedAt,
    }));

    // ✅ Calculate total earnings
    const totalEarnings = events.reduce(
      (sum, e) => sum + (e.paymentAmount || 0),
      0
    );

    return res.status(200).json({
      success: true,
      message: "Total earnings fetched successfully",
      totalEarnings,
      totalEvents: events.length,
      events,
    });
  } catch (err) {
    console.error("getSeekerTotalEarnings Error:", err);
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
  getApplicantsByEvent,
  updateApplicationStatus,
  getSeekerTotalEarnings,
  getSeekerEvents,
};
