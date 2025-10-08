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

      console.log("Seeker Event Query:", query);

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

    if (status === "completed") {
      const deletedGroup = await Group.findOneAndDelete({ event_id: eventId });
      if (deletedGroup) {
        console.log(`🗑️ Group deleted for completed event: ${event.eventName}`);
      }

      // Optional: Notify group members
      const applications = await EventApplication.find({
        event_id: eventId,
        applicationStatus: "accepted",
      });
      for (const app of applications) {
        await sendNotification({
          sender_id: organizerId,
          receiver_id: app.seeker_id,
          event_id: eventId,
          type: "group-delete",
          title: "Event Completed",
          message: `The event "${event.eventName}" has been completed. The event group has now been closed.`,
        });
      }
    }

    // for (const app of applicants) {
    //   await sendNotification({
    //     sender_id: organizerId,
    //     receiver_id: app.seeker_id,
    //     event_id: eventId,
    //     type: "event-status",
    //     title: "Event Status Changed",
    //     message: `The event "${event.eventName}" is now ${status}`,
    //   });
    // }

    return res.status(200).json({
      success: true,
      message: `Event status updated to '${status}'${
        status === "completed" ? " and group deleted" : ""
      }`,
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

    const recentActivity = await Promise.all(
      applications
        .filter((app) => app.event_id !== null)
        .map(async (app) => {
          // 🔍 Organizer profile
          const organizerProfile = await UserProfile.findOne(
            { userId: app.event_id.organizer_id },
            "profile_img"
          );

          return {
            event_id: app.event_id._id,
            eventName: app.event_id.eventName,
            shiftTime: app.event_id.shiftTime,
            location: app.event_id.location,
            eventStatus: app.event_id.eventStatus,
            organizer_name: app.event_id.organizer_name,
            organizer_img: organizerProfile
              ? organizerProfile.profile_img
              : null, // ✅ added
            appliedAt: app.createdAt,
            applicantStatus: app.applicationStatus,
          };
        })
    );

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

    const organizerProfile = await UserProfile.findOne(
      { userId: organizerId },
      "profile_img"
    );

    const recentEvents = await Event.find({ organizer_id: user._id })
      .sort({ createdAt: -1 })
      .limit(5);

    const formattedRecentEvents = recentEvents.map((event) => ({
      event_id: event._id,
      eventName: event.eventName,
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
      organizer_img: organizerProfile ? organizerProfile.profile_img : null,
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
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    // const organizer = await UserAuth.findById(userId);
    // if (!organizer || organizer.role !== "organizer") {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Only organizers can view seeker details",
    //   });
    // }

    const { seekerId } = req.body;
    if (!seekerId) {
      return res.status(400).json({
        success: false,
        message: "Seeker ID is required",
      });
    }

    const seekerAuth = await UserAuth.findById(seekerId).select(
      "name email phone gender birthdate role"
    );
    if (!seekerAuth) {
      return res.status(404).json({
        success: false,
        message: "Seeker not found",
      });
    }

    const seekerProfile = await UserProfile.findOne({ userId: seekerId });
    if (!seekerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seeker profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Seeker details fetched successfully",
      seeker: {
        ...seekerAuth.toObject(),
        profile: seekerProfile,
      },
    });
  } catch (err) {
    console.error("View Seeker Details Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMyAppliedEvents = async (req, res) => {
  try {
    // ✅ Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    }

    const userId = decoded._id;
    const userRole = decoded.role; // 👈 make sure you add `role` in JWT when login

    // ================================
    // 👤 If role = SEEKER → Applied Events
    // ================================
    if (userRole === "seeker") {
      const applications = await EventApplication.find({
        seeker_id: userId,
      }).populate("event_id");

      if (!applications || applications.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No applied events found",
          events: [],
        });
      }

      const appliedEvents = applications
        .filter((app) => app.event_id)
        .map((app) => ({
          event_id: app.event_id._id,
          eventName: app.event_id.eventName,
          startDate: app.event_id.startDate,
          endDate: app.event_id.endDate,
          location: app.event_id.location,
          shiftTime: app.event_id.shiftTime,
          organizer_name: app.event_id.organizer_name,
          eventStatus: app.event_id.eventStatus,
          applicationStatus: app.applicationStatus,
          appliedAt: app.createdAt,
        }));

      return res.status(200).json({
        success: true,
        role: "seeker",
        count: appliedEvents.length,
        events: appliedEvents,
      });
    }

    // ================================
    // 👤 If role = ORGANIZER → Created Events
    // ================================
    if (userRole === "organizer") {
      const events = await Event.find({ organizer_id: userId });

      if (!events || events.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No events created",
          events: [],
        });
      }

      const createdEvents = events.map((event) => ({
        event_id: event._id,
        eventName: event.eventName,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
        shiftTime: event.shiftTime,
        eventStatus: event.eventStatus,
      }));

      return res.status(200).json({
        success: true,
        role: "organizer",
        count: createdEvents.length,
        events: createdEvents,
      });
    }

    // ❌ Invalid role
    return res.status(403).json({
      success: false,
      message: "Invalid role",
    });
  } catch (err) {
    console.error("Get My Events Error:", err);
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
  getMyAppliedEvents,
};
