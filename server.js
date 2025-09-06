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
  pingTimeout: 6000000, // 60 seconds (default: 20000)
  pingInterval: 250000000, // 25 seconds (default: 25000)
});

let onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  // ✅ Handle ping to keep connection alive
  socket.on("ping", () => {
    socket.emit("pong");
    console.log(`Ping received from ${socket.id}`);
  });

  // ✅ User joins
  socket.on("join", (userId) => {
    onlineUsers.set(userId.toString(), socket.id);
    console.log(`User ${userId} joined with socket ${socket.id}`);
  });

  // ✅ Join group (room-based)
  socket.on("join-group", (groupId) => {
    socket.join(groupId);
    console.log(`Socket ${socket.id} joined group ${groupId}`);
  });

  // ✅ Typing indicator
  socket.on("typing", ({ groupId, userId }) => {
    socket.to(groupId).emit("typing", { userId });
  });

  socket.on("stop-typing", ({ groupId, userId }) => {
    socket.to(groupId).emit("stop-typing", { userId });
  });

  // ✅ Message seen
  socket.on("message-seen", async ({ messageId, groupId, userId }) => {
    try {
      await Message.findByIdAndUpdate(messageId, { status: "seen" });

      io.to(groupId).emit("message-status", {
        messageId,
        status: "seen",
        seenBy: userId,
      });

      console.log(`✅ Message ${messageId} seen by ${userId}`);
    } catch (err) {
      console.error("❌ Error updating seen status:", err);
    }
  });

  // ✅ Disconnect
  socket.on("disconnect", () => {
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});

global.io = io;
global.onlineUsers = onlineUsers;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cache = new NodeCache();

app.delete("/api/cache/clear", (req, res) => {
  cache.flushAll();
  res.status(200).json({ message: "Cache cleared successfully!" });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/profile", require("./routes/profileRoutes"));
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/payment", require("./routes/paymetRoutes"));
app.use("/api/attendees", require("./routes/attendee"));
app.use("/api/messages", require("./routes/messageRoutes"));

app.use(cookieParser());
app.use(errorMiddleware);

const handler = serverless(app);

module.exports = app;
module.exports.handler = handler;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO server is ready for WebSocket connections`);
  });
}
