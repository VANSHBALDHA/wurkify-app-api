const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  getProfileDetails,
  upsertProfile,
  updateSocialLinks,
  upsertDocumentation,
  upsertBankDetails,
  upsertWorkExperience,
} = require("../controllers/profileController");
const UserProfile = require("../models/UserProfile");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

router.post("/", upload.none(), getProfileDetails);
router.post(
  "/update-profile",
  upload.fields([
    { name: "profile_img", maxCount: 1 },
    { name: "photos", maxCount: 10 },
  ]),
  upsertProfile
);
router.post("/social-links", upload.none(), updateSocialLinks);
router.post(
  "/documentation",
  upload.fields([
    { name: "aadharImage", maxCount: 1 },
    { name: "panImage", maxCount: 1 },
  ]),
  upsertDocumentation
);
router.post("/bank-details", upload.none(), upsertBankDetails);
router.post("/work-experience", upload.none(), upsertWorkExperience);

router.post("/save-token", upload.none(), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = decoded._id;

    const { fcm_token } = req.body;

    if (!fcm_token) {
      return res.status(400).json({
        success: false,
        message: "FCM token is required",
      });
    }

    if (!fcm_token || typeof fcm_token !== "string" || fcm_token.length < 20) {
      return res.status(400).json({
        success: false,
        message: "Invalid FCM token provided",
      });
    }

    const updatedProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { fcm_token },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "FCM token saved successfully",
      data: { userId, fcm_token: updatedProfile.fcm_token },
    });
  } catch (err) {
    console.error("❌ Save Token Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while saving token",
    });
  }
});

module.exports = router;
