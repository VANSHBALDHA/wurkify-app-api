const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const errorMiddleware = require("./middlewares/errorMiddleware");
const cors = require("cors");
const NodeCache = require("node-cache");
const cookieParser = require("cookie-parser");
const serverless = require("serverless-http");
const http = require("http");
const { Server } = require("socket.io");
const Message = require("./models/Message");
const admin = require("./firebase");
const UserProfile = require("./models/UserProfile");


dotenv.config();
connectDB();

const app = express();

var corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

let onlineUsers = new Map();

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {
  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("test", () => {
    console.log("📩 Test event received from:", socket.id);
    socket.emit("test-response", {
      message: "Test successful!",
      socketId: socket.id,
    });
  });

  socket.on("join", (userId) => {
    try {
      if (!userId) throw new Error("User ID is required");
      const userIdStr = userId.toString();
      onlineUsers.set(userIdStr, socket.id);
      socket.emit("join-success", { userId: userIdStr, socketId: socket.id });
    } catch (error) {
      console.error("❌ Error in join event:", error);
      socket.emit("join-error", { error: error.message });
    }
  });

  socket.on("join-group", (groupId) => {
    socket.join(groupId);
  });

  // 🔔 Unified message broadcasting hook
  socket.on("broadcast-message", async (message) => {
    try {
      // 1. Emit to group via sockets
      io.to(message.groupId).emit("new-message", message);

      // 2. Send Firebase push to group members (except sender)
      const group = await require("./models/Group").findById(message.groupId).lean();
      if (!group) return;

      const senderProfile = await UserProfile.findOne({ userId: message.sender._id }, "profile_img").lean();

      // Get all group members except sender
      const targetUserIds = group.members
        .map((m) => m.toString())
        .filter((id) => id !== message.sender._id.toString());

      // Fetch FCM tokens for target users
      const tokens = await require("./models/AuthUsers")
        .find({ _id: { $in: targetUserIds }, fcmToken: { $exists: true, $ne: "" } }, "fcmToken")
        .lean();

      const fcmTokens = tokens.map((t) => t.fcmToken);

      if (fcmTokens.length > 0) {
        await admin.messaging().sendMulticast({
          tokens: fcmTokens,
          notification: {
            title: message.sender.name,
            body: message.text || (message.media?.length ? "📎 Media" : "New Message"),
            imageUrl: senderProfile?.profile_img || undefined,
          },
          data: {
            groupId: message.groupId,
            senderId: message.sender._id.toString(),
            type: "chat",
          },
        });
      }
    } catch (err) {
      console.error("❌ Error in broadcast-message handler:", err);
    }
  });

  socket.on("disconnect", (reason) => {
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
  });

  socket.on("error", (err) => {
    console.error(`❌ Socket error on ${socket.id}:`, err);
  });
});

// Export for other modules
module.exports.io = io;
module.exports.onlineUsers = onlineUsers;

// ================== APP MIDDLEWARE ==================
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cache = new NodeCache();

app.delete("/api/cache/clear", (req, res) => {
  cache.flushAll();
  res.status(200).json({ message: "Cache cleared successfully!" });
});

// ================== ROUTES ==================
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/payment", require("./routes/paymetRoutes"));
app.use("/api/attendees", require("./routes/attendee"));
app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));

app.use(cookieParser());
app.use(errorMiddleware);

const handler = serverless(app);

module.exports = app;
module.exports.handler = handler;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO ready`);
  });
}
