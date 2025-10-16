const express = require("express");
const router = express.Router();
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });
const { getReferralSummary } = require("../controllers/referralController");

router.post("/summary", upload.none(), getReferralSummary);

module.exports = router;
