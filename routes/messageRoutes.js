const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const {
  sendMessage,
  getMessages,
  getUserGroups,
  getEventGroupMembers
} = require("../controllers/messageController");

router.post("/send", upload.array("files", 10), sendMessage);
router.post("/", upload.none(), getMessages);
router.get("/groups", upload.none(), getUserGroups);
router.post("/members", upload.none(), getEventGroupMembers);

module.exports = router;
