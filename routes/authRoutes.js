const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  registerUser,
  verifyOtp,
  userLogin,
  forgotPassword,
  verifyForgotOtp,
  resetPassword,
  deleteAccount,
  resetOtp,
  changePin,
} = require("../controllers/AuthController");

router.post("/register", upload.none(), registerUser);
router.post("/verify-otp", upload.none(), verifyOtp);
router.post("/login", upload.none(), userLogin);
router.post("/forgot-password", upload.none(), forgotPassword);
router.post("/verify-forgot-otp", upload.none(), verifyForgotOtp);
router.post("/reset-password", upload.none(), resetPassword);
router.delete("/delete-account", upload.none(), deleteAccount);
router.post("/change-password", upload.none(), changePin);
router.post("/reset-otp", upload.none(), resetOtp);

module.exports = router;
