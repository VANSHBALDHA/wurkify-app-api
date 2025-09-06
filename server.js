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

/*
================================================================================
SOCKET.IO IMPLEMENTATION DOCUMENTATION
================================================================================

WebSocket URL: ws://localhost:5000/socket.io/?EIO=4&transport=websocket
Ping Settings: pingTimeout: 60000ms, pingInterval: 25000ms

EVENTS & EMITS:

1. CONNECTION EVENTS:
   - Auto-connect on WebSocket connection
   - Handshake: 0{"sid":"socket_id","upgrades":[],"pingInterval":25000,"pingTimeout":60000,"maxPayload":1000000}

2. USER AUTHENTICATION:
   Client → Server: 42["join","USER_ID"]
   Server → Client: 42["join-success",{"userId":"USER_ID","socketId":"SOCKET_ID"}]
   Server → Client: 42["join-error",{"error":"Error message"}]

3. GROUP MANAGEMENT:
   Client → Server: 42["join-group","GROUP_ID"]
   (No specific response event)

4. MESSAGING (via REST API + Socket.IO notifications):
   REST API: POST /api/messages/send (Body: {groupId, text})
   Server → Client: 42["message-status",{"messageId":"ID","status":"delivered"}]
   Server → Client: 42["new-message",{"groupId":"ID","text":"text","sender":"USER_ID","createdAt":"timestamp"}]

5. KEEP-ALIVE:
   Client → Server: 42["ping"]
   Server → Client: 42["pong"]

6. TESTING:
   Client → Server: 42["test"]
   Server → Client: 42["test-response",{"message":"Test successful!","socketId":"SOCKET_ID"}]

7. DISCONNECT:
   Auto-disconnect with reason logging

FLUTTER IMPLEMENTATION:
- Use socket_io_client: ^2.0.3+1
- Connect → Join User → Join Group → Send Messages via REST → Listen for Events
- Messages sent via REST API, Socket.IO for real-time notifications only

================================================================================
*/

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

io.on("connection", (socket) => {
  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("test", () => {
    socket.emit("test-response", {
      message: "Test successful!",
      socketId: socket.id,
    });
  });

  socket.on("join", (userId) => {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      if (typeof userId !== "string" && typeof userId !== "object") {
        throw new Error(`Invalid user ID type: ${typeof userId}`);
      }

      const userIdStr = userId.toString();

      onlineUsers.set(userIdStr, socket.id);

      socket.emit("join-success", { userId: userIdStr, socketId: socket.id });
    } catch (error) {
      console.error("❌ Error in join event:", error);
      console.error("❌ Error stack:", error.stack);
      socket.emit("join-error", { error: error.message });
    }
  });

  socket.on("join-group", (groupId) => {
    socket.join(groupId);
  });

  // socket.on("typing", ({ groupId, userId }) => {
  //   socket.to(groupId).emit("typing", { userId });
  // });

  // socket.on("stop-typing", ({ groupId, userId }) => {
  //   socket.to(groupId).emit("stop-typing", { userId });
  // });

  // socket.on("message-seen", async ({ messageId, groupId, userId }) => {
  //   try {
  //     await Message.findByIdAndUpdate(messageId, { status: "seen" });

  //     io.to(groupId).emit("message-status", {
  //       messageId,
  //       status: "seen",
  //       seenBy: userId,
  //     });
  //   } catch (err) {
  //     console.error("❌ Error updating seen status:", err);
  //   }
  // });

  socket.on("disconnect", (reason) => {
    if (reason === "ping timeout") {
      console.warn(`⚠️ Ping timeout for socket ${socket.id}`);
    } else if (reason === "transport error") {
      console.error(`❌ Transport error for socket ${socket.id}`);
    } else if (reason === "client namespace disconnect") {
    } else if (reason === "server namespace disconnect") {
      console.log(`ℹ️ Server initiated disconnect for socket ${socket.id}`);
    }
    console.log(`🔌 Socket disconnected: ${socket.id} due to ${reason}`);
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} removed from onlineUsers`);
        break;
      }
    }
  });

  socket.on("error", (err) => {
    console.error(`❌ Socket error on ${socket.id}:`, err);
  });
});

// Export for use in other modules
module.exports.io = io;
module.exports.onlineUsers = onlineUsers;

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cache = new NodeCache();

app.delete("/api/cache/clear", (req, res) => {
  cache.flushAll();
  res.status(200).json({ message: "Cache cleared successfully!" });
});

// Test endpoint to verify user ID
app.get("/api/test/user/:userId", (req, res) => {
  const { userId } = req.params;
  console.log(`🔍 Testing user ID: ${userId}`);
  res.json({
    userId,
    type: typeof userId,
    length: userId.length,
    isValid: userId.length === 24 && /^[0-9a-fA-F]+$/.test(userId),
  });
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
