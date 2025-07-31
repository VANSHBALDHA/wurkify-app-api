const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  organizer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserAuth",
    required: true,
  },
  organizer_name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50,
  },
  eventName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  eventDate: {
    type: Date,
    required: true,
  },
  shiftTime: {
    type: String,
    required: true,
    trim: true,
  },
  dressCode: {
    type: Boolean,
    required: true,
  },
  dressCodeDescription: {
    type: String,
    trim: true,
    maxlength: 200,
    default: null,
  },
  paymentAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentClearanceDays: {
    type: Number,
    required: true,
    min: 0,
  },
  workDescription: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  },
  location: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  requiredMemberCount: {
    type: Number,
    required: true,
    min: 1,
  },
  additionalNotes: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: null,
  },
  eventStatus: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Event", eventSchema);
