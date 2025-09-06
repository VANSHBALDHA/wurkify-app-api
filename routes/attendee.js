const express = require("express");
const router = express.Router();
const multer = require("multer");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
  submitCheckin,
  submitCheckout,
  getMyAttendanceStatus,
  getPendingAttendance,
  updateAttendanceStatus,
  getAcceptedEventList,
  getMyTimesheet,
} = require("../controllers/AttendeeController");

router.post("/checkin", upload.single("checkinSelfie"), submitCheckin);
router.post("/checkout", upload.single("checkoutSelfie"), submitCheckout);
router.post("/my-status", upload.none(), getMyAttendanceStatus);
router.post("/pending", upload.none(), getPendingAttendance);
router.post("/update-status", upload.none(), updateAttendanceStatus);
router.get("/accepted-events", upload.none(), getAcceptedEventList);
router.post("/my-timesheet", upload.none(), getMyTimesheet);

module.exports = router;
