const multer = require("multer");
const path = require("path");

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Folder where files will be saved
  },
  filename: (req, file, cb) => {
    // Example: profile_1693922345678.png
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, "profile_" + uniqueName);
  },
});

// Initialize multer (⚡ no validation)
const upload = multer({
  storage,
});

module.exports = upload;
