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
const jwt = require("jsonwebtoken");

dotenv.config();
connectDB();

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const app = express();

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.user._id.toString();

  console.log(`🔌 Socket connected: ${userId}`);

  socket.join(userId);

  socket.on("join-group", (groupId) => {
    if (!groupId) return;
    socket.join(groupId);
    console.log(`👥 ${userId} joined group ${groupId}`);
  });

  socket.on("leave-group", (groupId) => {
    socket.leave(groupId);
    console.log(`🚪 ${userId} left group ${groupId}`);
  });

  // Caller initiates audio call
  socket.on("audio-call-initiate", ({ to }) => {
    console.log(`📞 Audio call from ${userId} to ${to}`);
    io.to(to).emit("incoming-audio-call", {
      from: userId,
    });
  });

  socket.on("audio-call-accept", ({ to }) => {
    console.log(`✅ Call accepted by ${userId}`);
    io.to(to).emit("audio-call-accepted", {
      from: userId,
    });
  });

  socket.on("audio-call-reject", ({ to }) => {
    console.log(`❌ Call rejected by ${userId}`);
    io.to(to).emit("audio-call-rejected", {
      from: userId,
    });
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    io.to(to).emit("webrtc-offer", {
      from: userId,
      offer,
    });
  });

  // WebRTC Answer
  socket.on("webrtc-answer", ({ to, answer }) => {
    io.to(to).emit("webrtc-answer", {
      from: userId,
      answer,
    });
  });

  // ICE Candidates
  socket.on("webrtc-ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("webrtc-ice-candidate", {
      from: userId,
      candidate,
    });
  });

  // Call ended
  socket.on("audio-call-ended", ({ to }) => {
    console.log(`📴 Call ended by ${userId}`);
    io.to(to).emit("audio-call-ended", {
      from: userId,
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Socket disconnected: ${userId} (${reason})`);
  });

  socket.on("error", (err) => {
    console.error(`❌ Socket error (${userId}):`, err);
  });
});

module.exports.io = io;

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
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api", require("./routes/usersearch"));
app.use("/api/referral", require("./routes/referralRoutes"));

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
