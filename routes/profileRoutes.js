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
const authenticateUser = require("../middlewares/authenticateUser");

router.post("/", upload.none(), getProfileDetails);
router.post("/update-profile", upload.single("profile_img"), upsertProfile);
router.post("/social-links", upload.none(), updateSocialLinks);
router.post("/documentation", upload.none(), upsertDocumentation);
router.post("/bank-details", upload.none(), upsertBankDetails);
router.post("/work-experience", upload.none(), upsertWorkExperience);

module.exports = router;
