const jwt = require("jsonwebtoken");
const UserAuth = require("../models/AuthUsers");
const Notification = require("../models/Notification");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getNotifications = async (req, res) => {
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
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const userId = decoded._id;
    const user = await UserAuth.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const notifications = await Notification.find({ receiver_id: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      role: user.role,
      total: notifications.length,
      notifications: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        eventId: n.event_id || null,
        senderId: n.sender_id || null,
        receiverId: n.receiver_id,
        status: n.status, // read/unread
        createdAt: n.createdAt,
      })),
    });
  } catch (err) {
    console.error("Get Notifications Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res
        .status(400)
        .json({ success: false, message: "Notification ID required" });
    }

    const updated = await Notification.findByIdAndUpdate(
      notificationId,
      { status: "read" },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification: updated,
    });
  } catch (err) {
    console.error("Mark Notification Read Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    await Notification.updateMany(
      { receiver_id: userId, status: "unread" },
      { $set: { status: "read" } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("Mark All Notifications Read Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res
        .status(400)
        .json({ success: false, message: "Notification ID required" });
    }

    const deleted = await Notification.findByIdAndDelete(notificationId);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (err) {
    console.error("Delete Notification Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const clearAllNotifications = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    await Notification.deleteMany({ receiver_id: userId });

    return res.status(200).json({
      success: true,
      message: "All notifications cleared",
    });
  } catch (err) {
    console.error("Clear Notifications Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
};
