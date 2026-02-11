// const mongoose = require("mongoose");

// const SessionSchema = new mongoose.Schema(
//   {
//     checkinSelfie: { type: String },
//     checkinTime: { type: Date },
//     checkinStatus: {
//       type: String,
//       enum: ["pending", "approved", "rejected", "none"],
//       default: "none",
//     },
//     checkoutSelfie: { type: String },
//     checkoutTime: { type: Date },
//     checkoutStatus: {
//       type: String,
//       enum: ["pending", "approved", "rejected", "none"],
//       default: "none",
//     },
//   },
//   { _id: true } // give each session its own ID
// );

// const AttendeeCheckinSchema = new mongoose.Schema(
//   {
//     eventId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Event",
//       required: true,
//     },
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "UserAuth",
//       required: true,
//     },
//     sessions: [SessionSchema], // 👈 now we support multiple sessions
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("AttendeeCheckin", AttendeeCheckinSchema);

const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema(
  {
    checkinSelfie: String,
    checkoutSelfie: String,

    checkinTime: Date,
    checkoutTime: Date,

    checkinStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    checkoutStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // 📍 GPS data
    checkinLocation: {
      lat: Number,
      lng: Number,
    },
    checkoutLocation: {
      lat: Number,
      lng: Number,
    },

    // 🕒 calculated
    attendanceDate: Date,
    durationMinutes: Number,

    // 📝 seeker report
    report: {
      message: String,
      createdAt: Date,
    },
  },
  { timestamps: true },
);

const AttendeeCheckinSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthUsers",
      required: true,
    },
    sessions: [SessionSchema],
  },
  { timestamps: true },
);

module.exports = mongoose.model("AttendeeCheckin", AttendeeCheckinSchema);
