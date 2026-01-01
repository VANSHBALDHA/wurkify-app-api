const jwt = require("jsonwebtoken");
const Group = require("../models/Group");
const Message = require("../models/Message");
const UserProfile = require("../models/UserProfile");
const UserAuth = require("../models/AuthUsers");
const { io } = require("../server");
const admin = require("../firebase");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const sendMessage = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { groupId, text, messageType, duration } = req.body;
    if (!groupId) {
      return res
        .status(400)
        .json({ success: false, message: "groupId is required" });
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

    let media = [];
    let audio = null;

    if (messageType === "media" && req.files?.length) {
      for (let file of req.files) {
        const streamUpload = () =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: "group_messages", resource_type: "auto" },
              (error, result) => (result ? resolve(result) : reject(error))
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          });

        const result = await streamUpload();

        media.push({
          url: result.secure_url,
          type: result.resource_type,
          format: result.format,
          size: file.size,
          originalName: file.originalname,
        });
      }
    }

    if (messageType === "audio" && req.files?.length) {
      const file = req.files[0];

      const uploadAudio = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "group_messages",
              resource_type: "auto",
            },
            (error, result) => (result ? resolve(result) : reject(error))
          );

          streamifier.createReadStream(file.buffer).pipe(stream);
        });

      const result = await uploadAudio();

      audio = {
        url: result.secure_url,
        duration: Number(duration) || 0,
        waveform: [],
      };
    }

    if (
      (messageType === "text" && !text) ||
      (messageType === "media" && media.length === 0) ||
      (messageType === "audio" && !audio)
    ) {
      return res.status(400).json({
        success: false,
        message: "Message content required",
      });
    }

    const newMessage = await Message.create({
      group_id: groupId,
      sender_id: userId,
      messageType,
      text: messageType === "text" ? text : null,
      audio: messageType === "audio" ? audio : null,
      media: messageType === "media" ? media : [],
      status: "sent",
    });

    await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });

    const sender = await UserAuth.findById(userId, "name email role").lean();
    const senderProfile = await UserProfile.findOne(
      { userId },
      "profile_img fcm_token"
    ).lean();

    console.log("senderProfile", senderProfile);

    const enrichedMessage = {
      _id: newMessage._id,
      messageType: newMessage.messageType,
      text: newMessage.text,
      audio: newMessage.audio,
      media: newMessage.media || [],
      status: "delivered",
      createdAt: newMessage.createdAt,
      sender: {
        _id: sender._id,
        name: sender.name,
        profile_img: senderProfile?.profile_img || "",
      },
    };

    io.to(groupId.toString()).emit("new-message", enrichedMessage);

    for (let memberId of group.members) {
      if (memberId.toString() === userId.toString()) continue;

      const memberProfile = await UserProfile.findOne(
        { userId: memberId },
        "fcm_token"
      ).lean();

      if (memberProfile?.fcm_token) {
        let preview = "New message";

        if (messageType === "text") {
          preview = text?.substring(0, 50);
        } else if (messageType === "audio") {
          preview = "🎤 Voice message";
        } else if (messageType === "media") {
          preview = `📎 ${media.length} attachment(s)`;
        }

        try {
          await admin.messaging().send({
            token: memberProfile.fcm_token,
            notification: {
              title: `${sender?.name || "Someone"} sent a message`,
              body: preview,
              imageUrl: senderProfile?.profile_img || undefined,
            },
            data: {
              groupId: groupId.toString(),
              messageType,
              messageId: newMessage._id.toString(),
            },
          });
          console.log(`✅ Push sent to ${memberId}`);
        } catch (error) {
          console.error("❌ Error sending push:", error);
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: enrichedMessage,
    });
  } catch (err) {
    console.error("Send Message Error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
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
      .sort({ createdAt: 1 })
      .lean();

    const senderIds = messages.map((m) => m.sender_id?._id).filter(Boolean);

    const profiles = await UserProfile.find(
      { userId: { $in: senderIds } },
      "userId profile_img"
    ).lean();

    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p.profile_img;
    });

    const enrichedMessages = messages.map((m) => ({
      _id: m._id,
      messageType: m.messageType,
      text: m.messageType === "text" ? m.text : null,
      audio: m.messageType === "audio" ? m.audio : null,
      media: m.messageType === "media" ? m.media || [] : [],
      status: m.status,
      createdAt: m.createdAt,
      sender: {
        _id: m.sender_id?._id,
        name: m.sender_id?.name,
        email: m.sender_id?.email,
        role: m.sender_id?.role,
        profile_img: profileMap[m.sender_id?._id.toString()] || "",
      },
    }));

    return res.status(200).json({
      success: true,
      total: enrichedMessages.length,
      messages: enrichedMessages,
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
      .populate("event_id", "eventName startDate location")
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
