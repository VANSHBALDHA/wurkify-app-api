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
  requestSeekerWithdrawal,
} = require("../controllers/PaymentController");
const {
  getAdminWithdrawalList,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controllers/adminWithdrawalController");

router.get("/events", upload.none(), getPaymentEventList);
router.post("/event-users", upload.none(), getEventUserPayments);
router.post("/update-payment", upload.none(), updatePaymentStatus);
router.post("/release-payment", upload.none(), releasePaymentToSeeker);
router.post("/wallet", upload.none(), getWalletDetails);
router.post("/seeker-earnings", upload.none(), getSeekerEarnings);
router.post("/withdraw-earnings", upload.none(), withdrawSeekerEarnings);
router.post("/withdrawals/request", upload.none(), requestSeekerWithdrawal);
router.get("/admin/withdrawals", getAdminWithdrawalList);
router.post("/admin/withdrawals/approve", approveWithdrawal);
router.post("/admin/withdrawals/reject", rejectWithdrawal);

module.exports = router;
