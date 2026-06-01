const mongoose = require("mongoose");

// Fallback MongoDB URI
const MONGO_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://baldhavansh2505:5yw0IEhqR6xjG7DB@wurkify-app-api.twbmlro.mongodb.net/?retryWrites=true&w=majority&appName=wurkify-app-api";

// Cached connection promise across hot serverless invocations
let cachedConnection = null;

const connectDB = async () => {
  // 1. If already connected, reuse the active connection
  if (mongoose.connection.readyState >= 1) {
    console.log("🔄 Using existing MongoDB connection");
    return mongoose.connection;
  }

  // 2. If a connection is already in progress, await that connection promise
  if (cachedConnection) {
    console.log("⏳ Awaiting pending MongoDB connection...");
    return cachedConnection;
  }

  console.log("🔌 Establishing new MongoDB connection...");

  const options = {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of default 30s
    socketTimeoutMS: 45000,         // Close sockets after 45s of inactivity
  };

  cachedConnection = mongoose.connect(MONGO_URI, options)
    .then((mongooseInstance) => {
      console.log("✅ MongoDB connected successfully");
      return mongooseInstance;
    })
    .catch((error) => {
      console.error("❌ MongoDB connection failed:", error.message);
      cachedConnection = null; // Clear cached promise so next request can retry connection
      // Crucial: Do NOT call process.exit(1) on Vercel/serverless runtimes.
      // Doing so crashes the function container, causing 502/504 Gateway errors (FUNCTION_INVOCATION_FAILED)
      // and forcing a slow cold-start on the next API call.
      throw error;
    });

  return cachedConnection;
};

module.exports = connectDB;
