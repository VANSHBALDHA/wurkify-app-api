const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  getPaymentEventList,
  getEventUserPayments,
  createPaymentOrder,
  verifyPayment,
} = require("../controllers/PaymentController");

router.get("/events", upload.none(), getPaymentEventList);
router.post("/event-users", upload.none(), getEventUserPayments);
router.post("/create-order", upload.none(), createPaymentOrder);
router.post("/verify-payment", upload.none(), verifyPayment);

module.exports = router;
