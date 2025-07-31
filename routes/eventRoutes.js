const express = require("express");
const router = express.Router();
const {
  getEventList,
  getEventById,
  createEvent,
  updateEventStatus,
  getRecentEvents,
  deleteEvent,
  applyToEvent,
  getSeekerRecentActivity,
  getApplicantsByEvent,
  updateApplicationStatus,
} = require("../controllers/eventController");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get("/list", upload.none(), getEventList);
router.post("/view", upload.none(), getEventById);
router.post("/create-event", upload.none(), createEvent);
router.post("/update-status", upload.none(), updateEventStatus);
router.post("/recent", upload.none(), getRecentEvents);
router.post("/delete", upload.none(), deleteEvent);
router.post("/apply-to-event", upload.none(), applyToEvent);
router.post("/seeker/recent-activity", upload.none(), getSeekerRecentActivity);
router.post("/event-applicants", upload.none(), getApplicantsByEvent);
router.post("/application-status", upload.none(), updateApplicationStatus);

module.exports = router;
