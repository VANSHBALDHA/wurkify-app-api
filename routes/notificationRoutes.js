const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  getNotifications,
  markNotificationRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} = require("../controllers/notificationController");

router.get("/", upload.none(), getNotifications);
router.post("/read", upload.none(), markNotificationRead);
router.post("/read-all", upload.none(), markAllAsRead);
router.delete("/delete", upload.none(), deleteNotification);
router.delete("/clear", upload.none(), clearAllNotifications);

module.exports = router;
