const express = require("express");
const router = express.Router();
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  getReferralSummary,
  withdrawReferralMoney,
} = require("../controllers/referralController");

router.post("/summary", upload.none(), getReferralSummary);
router.post("/withdraw", upload.none(), withdrawReferralMoney);

module.exports = router;
