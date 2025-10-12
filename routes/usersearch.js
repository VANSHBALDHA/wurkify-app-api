const express = require("express");
const router = express.Router();
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });
const { searchUsers } = require("../controllers/userController");

router.post("/users/search", upload.none(), searchUsers);

module.exports = router;
