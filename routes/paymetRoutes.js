const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
  getPaymentEventList,
  getEventUserPayments,
  updatePaymentStatus,
} = require("../controllers/PaymentController");

// ✅ Organizer: Get all events with payment info
router.get("/events", upload.none(), getPaymentEventList);

// ✅ Organizer: Get all seeker payments for a specific event
router.post("/event-users", upload.none(), getEventUserPayments);

// ✅ Flutter: Update payment status after successful payment
router.post("/update-payment", upload.none(), updatePaymentStatus);

module.exports = router;
