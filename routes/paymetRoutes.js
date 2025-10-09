const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const {
  getPaymentEventList,
  getEventUserPayments,
  updatePaymentStatus,
  releasePaymentToSeeker,
  getWalletDetails,
  getSeekerEarnings,
  withdrawSeekerEarnings,
} = require("../controllers/PaymentController");

// ✅ Organizer: Get all events with payment info
router.get("/events", upload.none(), getPaymentEventList);

// ✅ Organizer: Get all seeker payments for a specific event
router.post("/event-users", upload.none(), getEventUserPayments);

// ✅ Flutter: Update payment status after successful payment
router.post("/update-payment", upload.none(), updatePaymentStatus);

// ✅ Organizer releases payment to seeker’s wallet
router.post("/release-payment", upload.none(), releasePaymentToSeeker);

// ✅ Seeker: Fetch wallet balance and transaction history
router.post("/wallet", upload.none(), getWalletDetails);

// ✅ Seeker: Get all credited payments and total earnings
router.post("/seeker-earnings", upload.none(), getSeekerEarnings);

// ✅ Seeker: Withdraw earnings from wallet
router.post("/withdraw-earnings", upload.none(), withdrawSeekerEarnings);

module.exports = router;
