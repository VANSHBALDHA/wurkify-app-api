const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const UserAuth = require("../models/AuthUsers");
const EventApplication = require("../models/EventApplication");
const Notification = require("../models/Notification");
const UserProfile = require("../models/UserProfile");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

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

    // ✅ Basic event stats
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

    // ✅ Get all event IDs for this organizer
    const events = await Event.find(
      { organizer_id: organizerId },
      "_id eventName paymentAmount createdAt"
    );

    if (!events.length) {
      return res.status(200).json({
        success: true,
        message: "Organizer dashboard data fetched successfully",
        summary: {
          totalRegistered: 0,
          totalCompleted: 0,
          totalInProgress: 0,
          totalSpend: 0,
        },
        analytics: [],
        recentActivity: [],
      });
    }

    const eventIds = events.map((e) => e._id);

    // ✅ Fetch all paid applications (completed or credited)
    const paidApplications = await EventApplication.find({
      event_id: { $in: eventIds },
      paymentStatus: { $in: ["completed", "credited"] },
    });

    // ✅ Calculate total spend = sum(paymentAmount) for all paid users
    const totalSpend = paidApplications.reduce((sum, app) => {
      const amount = app.paymentAmount || 0;
      return sum + amount;
    }, 0);

    // ✅ Fix graph: total money spent per month (using paymentReceivedAt if exists)
    const analytics = await EventApplication.aggregate([
      {
        $match: {
          event_id: { $in: eventIds },
          paymentStatus: { $in: ["completed", "credited"] },
          paymentReceivedAt: { $ne: null }, // ✅ ignore null dates
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$paymentReceivedAt" },
            month: { $month: "$paymentReceivedAt" },
          },
          moneySpend: { $sum: "$paymentAmount" },
          paidCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // ✅ Prevent crash if _id is missing
    const eventAnalytics = analytics.map((item) => {
      const year = item._id?.year || 0;
      const month = item._id?.month || 0;
      const label =
        year && month
          ? `${year}-${month.toString().padStart(2, "0")}`
          : "Unknown";
      return {
        month: label,
        moneySpend: item.moneySpend || 0,
        paidCount: item.paidCount || 0,
      };
    });

    // ✅ Organizer Profile + Recent Events
    const organizerProfile = await UserProfile.findOne(
      { userId: organizerId },
      "profile_img"
    );

    const recentEvents = await Event.find({ organizer_id: organizerId })
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
        totalSpend, // ✅ now accurate total = paid users × their paid amount
      },
      analytics: eventAnalytics, // ✅ fixed graph data
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

const getOrganizerPaymentHistory = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const organizerId = decoded._id;

    // ✅ Check organizer
    const user = await UserAuth.findById(organizerId);
    if (!user || user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access payment history",
      });
    }

    // ✅ Fetch events created by this organizer
    const events = await Event.find({ organizer_id: organizerId });
    const eventIds = events.map((e) => e._id);

    // ✅ Fetch all completed payments
    const paidApplications = await EventApplication.find({
      event_id: { $in: eventIds },
      paymentStatus: { $in: ["completed", "credited"] },
    })
      .populate("event_id", "eventName paymentAmount startDate endDate")
      .populate("seeker_id", "name email");

    if (paidApplications.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payment history found",
        total: 0,
        history: [],
      });
    }

    // ✅ Format data for response
    const formattedHistory = paidApplications.map((app) => ({
      eventName: app.event_id?.eventName || "N/A",
      seekerName: app.seeker_id?.name || "Unknown",
      amountPaid: app.paymentAmount || app.event_id?.paymentAmount || 0,
      paymentDate: app.paymentReceivedAt || app.updatedAt,
      paymentStatus: app.paymentStatus,
    }));

    // ✅ Calculate total spend
    const totalPaid = formattedHistory.reduce(
      (sum, item) => sum + item.amountPaid,
      0
    );

    return res.status(200).json({
      success: true,
      message: "Organizer payment history fetched successfully",
      totalPayments: formattedHistory.length,
      totalPaid,
      history: formattedHistory.sort((a, b) => b.paymentDate - a.paymentDate),
    });
  } catch (err) {
    console.error("Get Organizer Payment History Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getSeekerRecentActivity,
  getOrganizerDashboard,
  viewSeekerDetails,
  getMyAppliedEvents,
  getOrganizerPaymentHistory,
};
