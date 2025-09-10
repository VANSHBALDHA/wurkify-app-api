const jwt = require("jsonwebtoken");
const Group = require("../models/Group");
const Message = require("../models/Message");
const UserProfile = require("../models/UserProfile");
const UserAuth = require("../models/AuthUsers"); // needed for name/email/role
const { io } = require("../server");
const admin = require("../firebase");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const sendMessage = async (req, res) => {
  try {
    // 🔑 Authenticate user
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded._id;

    const { groupId, text } = req.body;
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

    // 📤 Upload media files (if any) to Cloudinary
    let media = [];
    if (req.files && req.files.length > 0) {
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
        let normalizedType = ["mp3", "wav", "m4a"].includes(result.format)
          ? "audio"
          : result.resource_type;

        media.push({
          url: result.secure_url,
          type: normalizedType,
          format: result.format,
          size: file.size,
          originalName: file.originalname,
        });
      }
    }

    if (!text && media.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Message content required" });
    }

    // 💾 Save message
    const newMessage = await Message.create({
      group_id: groupId,
      sender_id: userId,
      text,
      media,
      status: "sent",
    });

    await Message.findByIdAndUpdate(newMessage._id, { status: "delivered" });

    // 👤 Get sender details for enrichment
    const sender = await UserAuth.findById(userId, "name email role").lean();
    const senderProfile = await UserProfile.findOne(
      { userId },
      "profile_img fcm_token"
    ).lean();

    const enrichedMessage = {
      _id: newMessage._id,
      text: newMessage.text,
      media: newMessage.media || [],
      status: "delivered",
      createdAt: newMessage.createdAt,
      sender: {
        _id: sender?._id,
        name: sender?.name,
        email: sender?.email,
        role: sender?.role,
        profile_img: senderProfile?.profile_img || "",
      },
    };

    io.to(groupId.toString()).emit("new-message", enrichedMessage);

    // 📲 Send push notifications to other members
    for (let memberId of group.members) {
      if (memberId.toString() === userId.toString()) continue;

      const memberProfile = await UserProfile.findOne(
        { userId: memberId },
        "fcm_token"
      ).lean();

      const preview =
        text?.substring(0, 50) ||
        (media.length > 0 ? `📎 ${media.length} attachment(s)` : "New message");

      if (memberProfile?.fcm_token) {
        const preview =
          text?.substring(0, 50) ||
          (media.length > 0
            ? `📎 ${media.length} attachment(s)`
            : "New message");

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
              senderId: userId.toString(),
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
      text: m.text,
      media: m.media || [],
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
