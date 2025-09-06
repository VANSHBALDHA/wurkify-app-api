const jwt = require("jsonwebtoken");
const Group = require("../models/Group");
const Message = require("../models/Message");
const UserProfile = require("../models/UserProfile");
const admin = require("../firebase");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const sendMessage = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { groupId, text } = req.body;
    if (!groupId || !text) {
      return res
        .status(400)
        .json({ success: false, message: "groupId and text are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found" });
    }

    if (!group.members.includes(userId)) {
      return res
        .status(403)
        .json({ success: false, message: "You are not part of this group" });
    }

    const newMessage = await Message.create({
      group_id: groupId,
      sender_id: userId,
      text,
      status: "sent",
    });

    await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });
    const { io } = require("../server");
    io.to(groupId).emit("message-status", {
      messageId: newMessage._id,
      status: "delivered",
    });

    for (let memberId of group.members) {
      if (memberId.toString() !== userId.toString()) {
        const userProfile = await UserProfile.findOne(
          { userId: memberId },
          "fcm_token"
        );

        if (userProfile?.fcm_token) {
          const payload = {
            notification: {
              title: "New Message",
              body: text,
            },
            data: {
              groupId: groupId.toString(),
              senderId: userId.toString(),
            },
          };

          try {
            await admin
              .messaging()
              .sendToDevice(userProfile.fcm_token, payload);
            console.log(`✅ Notification sent to ${memberId}`);
          } catch (error) {
            console.error("❌ Error sending notification:", error);
          }
        }
      }
    }

    const { onlineUsers } = require("../server");
    group.members.forEach((memberId) => {
      const socketId = onlineUsers.get(memberId.toString());
      if (socketId) {
        io.to(socketId).emit("new-message", {
          groupId,
          text,
          sender: userId,
          createdAt: newMessage.createdAt,
        });
      }
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: newMessage,
    });
  } catch (err) {
    console.error("Send Message Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMessages = async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) {
      return res
        .status(400)
        .json({ success: false, message: "groupId is required" });
    }

    const messages = await Message.find({ group_id: groupId })
      .populate("sender_id", "name email role")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      total: messages.length,
      messages,
    });
  } catch (err) {
    console.error("Get Messages Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getUserGroups = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    let groups = await Group.find({ members: userId })
      .populate("event_id", "eventName eventDate location")
      .populate("organizer_id", "name email")
      .populate("members", "name email")
      .lean();

    for (let group of groups) {
      const organizerProfile = await UserProfile.findOne(
        { userId: group.organizer_id._id },
        "profile_img"
      );
      group.organizer_id.profile_img = organizerProfile?.profile_img || "";

      const membersProfiles = await UserProfile.find(
        { userId: { $in: group.members.map((m) => m._id) } },
        "userId profile_img"
      );

      const profileMap = {};
      membersProfiles.forEach((p) => {
        profileMap[p.userId.toString()] = p.profile_img;
      });

      group.members = group.members.map((m) => ({
        ...m,
        profile_img: profileMap[m._id.toString()] || "",
      }));
    }

    return res.status(200).json({
      success: true,
      total: groups.length,
      groups,
    });
  } catch (err) {
    console.error("Get User Groups Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getEventGroupMembers = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { eventId } = req.body;
    if (!eventId) {
      return res
        .status(400)
        .json({ success: false, message: "eventId is required" });
    }

    const group = await Group.findOne({ event_id: eventId })
      .populate("members", "name email role")
      .lean();

    if (!group) {
      return res
        .status(404)
        .json({ success: false, message: "Group not found for this event" });
    }

    if (!group.members.find((m) => m._id.toString() === userId)) {
      return res
        .status(403)
        .json({ success: false, message: "You are not part of this group" });
    }

    const memberProfiles = await UserProfile.find(
      { userId: { $in: group.members.map((m) => m._id) } },
      "userId profile_img"
    );

    const profileMap = {};
    memberProfiles.forEach((p) => {
      profileMap[p.userId.toString()] = p.profile_img;
    });

    group.members = group.members.map((m) => ({
      ...m,
      profile_img: profileMap[m._id.toString()] || "",
    }));

    return res.status(200).json({
      success: true,
      total: group.members.length,
      members: group.members,
    });
  } catch (err) {
    console.error("Get Event Group Members Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  sendMessage,
  getMessages,
  getUserGroups,
  getEventGroupMembers,
};
