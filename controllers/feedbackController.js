const Feedback = require("../models/Feedback");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getAllFeedback = async (req, res) => {
  try {
    const feedbackList = await Feedback.find().populate("userId", "name email");
    res.status(200).json({
      success: true,
      feedback: feedbackList,
    });
  } catch (err) {
    console.error("getAllFeedback error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const submitFeedback = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const userId = decoded._id;
    const { rate, experience, suggestion } = req.body;

    if (!rate || !experience) {
      return res
        .status(400)
        .json({ success: false, message: "Rate and experience are required" });
    }

    const feedback = await Feedback.create({
      userId,
      rate,
      experience,
      suggestion,
    });

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
    });
  } catch (err) {
    console.error("submitFeedback error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  submitFeedback,
  getAllFeedback,
};
