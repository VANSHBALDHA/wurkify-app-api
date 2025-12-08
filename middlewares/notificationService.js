const Notification = require("../models/Notification");
const UserProfile = require("../models/UserProfile");
const admin = require("../firebase");

const sendNotification = async (data) => {
  try {
    const notification = await Notification.create({
      sender_id: data.sender_id,
      receiver_id: data.receiver_id,
      event_id: data.event_id || null,
      type: data.type,
      title: data.title,
      message: data.message,
      status: "unread",
    });

    const userProfile = await UserProfile.findOne({ userId: data.receiver_id });
    const fcmToken = userProfile?.fcm_token;

    if (fcmToken) {
      await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: data.title,
          body: data.message,
        },
        data: {
          notificationId: notification._id.toString(),
          eventId: data.event_id?.toString() || "",
          type: data.type,
        },
        android: {
          priority: "high",
        },
      });
    }

    if (global.onlineUsers instanceof Map) {
      const receiverSocket = global.onlineUsers.get(
        data.receiver_id.toString()
      );
      if (receiverSocket) {
        global.io.to(receiverSocket).emit("notification", {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          eventId: notification.event_id,
          senderId: notification.sender_id,
          createdAt: notification.createdAt,
        });
      }
    }

    return notification;
  } catch (err) {
    console.error("Send Notification Error:", err);
    return null;
  }
};

module.exports = { sendNotification };
