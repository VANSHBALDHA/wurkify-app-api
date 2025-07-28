const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  submitFeedback,
  getAllFeedback,
} = require("../controllers/feedbackController");

router.get("/", upload.none(), getAllFeedback);
router.post("/submit-feedback", upload.none(), submitFeedback);

module.exports = router;
