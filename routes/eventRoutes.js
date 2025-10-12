const express = require("express");
const router = express.Router();
const {
  getEventList,
  getEventById,
  createEvent,
  editEvent,
  updateEventStatus,
  deleteEvent,
  applyToEvent,
  getApplicantsByEvent,
  updateApplicationStatus,
} = require("../controllers/eventController");

const {
  getSeekerRecentActivity,
  getOrganizerDashboard,
  viewSeekerDetails,
  getMyAppliedEvents,
  getOrganizerPaymentHistory,
} = require("../controllers/DashboardController");

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get("/list", upload.none(), getEventList);
router.post("/view", upload.none(), getEventById);
router.post("/create-event", upload.none(), createEvent);
router.post("/edit-event", upload.none(), editEvent);
router.post("/update-status", upload.none(), updateEventStatus);
router.post("/delete", upload.none(), deleteEvent);
router.post("/apply-to-event", upload.none(), applyToEvent);
router.post("/seeker/recent-activity", upload.none(), getSeekerRecentActivity);
router.post("/event-applicants", upload.none(), getApplicantsByEvent);
router.post("/application-status", upload.none(), updateApplicationStatus);
router.post("/organizer/dashboard", upload.none(), getOrganizerDashboard);
router.post("/organizer/view-seeker", upload.none(), viewSeekerDetails);
router.get("/my-applied-events", upload.none(), getMyAppliedEvents);
router.post(
  "/organizer/payment-history",
  upload.none(),
  getOrganizerPaymentHistory
);

module.exports = router;
