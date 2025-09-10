const mongoose = require("mongoose");

const userAuthSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    phone: {
      type: String,
      default: null,
      match: [/^\d{10,15}$/, "Phone number must be between 10 and 15 digits"],
    },
    birthdate: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", null],
      default: null,
    },
    role: {
      type: String,
      enum: ["seeker", "organizer"],
      default: "seeker",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    token: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

userAuthSchema.index({ email: 1 });

const UserAuth = mongoose.model("UserAuth", userAuthSchema);

module.exports = UserAuth;
