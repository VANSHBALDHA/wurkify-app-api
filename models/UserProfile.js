const mongoose = require("mongoose");

const UserProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true,
  },
  profile_img: {
    type: String,
    default: "",
  },
  name: String,
  email: String,
  phone: String,
  birthdate: {
    type: Date,
    default: null,
  },
  age: Number,
  gender: String,
  weight: Number,
  state: String,
  city: String,
  height: String,
  fcm_token: { type: String, default: "" },
  skills: [{ name: String, proficiency: String }],
  education: {
    degree: String,
    institute: String,
    graduationYear: String,
  },
  socialLinks: {
    instagram: { type: String, default: "" },
    twitter: { type: String, default: "" },
    facebook: { type: String, default: "" },
    linkedin: { type: String, default: "" },
  },
  documentation: {
    aadharNumber: String,
    panNumber: String,
  },
  bankDetails: {
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String },
    branchName: { type: String },
    accountHolderName: { type: String },
    upiId: { type: String },
    upiNumber: { type: String },
  },
  workExperience: [
    {
      jobTitle: String,
      companyName: String,
      jobLocation: String,
      skillsUsed: [String],
      employmentType: {
        type: String,
        enum: ["Full time", "Part time", "Remote"],
      },
      startDate: Date,
      endDate: Date,
      currentlyWorking: Boolean,
      jobDescription: String,
    },
  ],
});

module.exports = mongoose.model("UserProfile", UserProfileSchema);
