// utils/seekerNotifications.js

exports.seekerMessages = {
  // 1. Apply for Event
  applied: (eventName) => ({
    title: "Application Submitted",
    message: `You have successfully applied for the event "${eventName}". You will be notified once the organizer reviews your application.`,
  }),

  // 2. Application Status
  accepted: (eventName) => ({
    title: "Application Accepted",
    message: `Congratulations! You have been selected for the event "${eventName}". A group chat has been created with your organizer.`,
  }),

  rejected: (eventName) => ({
    title: "Application Rejected",
    message: `Unfortunately, your application for "${eventName}" was not selected. Keep applying for more gigs.`,
  }),

  // 3. Event Reminder (for seeker)
  eventReminder: (eventName, date, time) => ({
    title: "Event Reminder",
    message: `Reminder: Your event "${eventName}" is scheduled for ${date} at ${time}. Don’t forget to check in!`,
  }),

  // 4. Attendance Verification
  checkinSubmitted: (eventName) => ({
    title: "Check-in Submitted",
    message: `You have successfully checked in for the event "${eventName}". Await organizer verification.`,
  }),

  checkinApproved: (eventName) => ({
    title: "Check-in Approved",
    message: `Your check-in for "${eventName}" has been approved.`,
  }),

  checkinRejected: (eventName) => ({
    title: "Check-in Rejected",
    message: `Your check-in for "${eventName}" was rejected. Please contact your organizer if this seems unexpected.`,
  }),

  checkoutSubmitted: (eventName) => ({
    title: "Check-out Submitted",
    message: `Your check-out for "${eventName}" has been submitted for approval.`,
  }),

  checkoutApproved: (eventName) => ({
    title: "Check-out Approved",
    message: `Your check-out for "${eventName}" has been approved.`,
  }),

  checkoutRejected: (eventName) => ({
    title: "Check-out Rejected",
    message: `Your check-out for "${eventName}" was rejected. Please contact your organizer if this seems unexpected.`,
  }),

  paymentCredited: (eventName, amount) => ({
    title: "Payment Credited",
    message: `Your work for event "${eventName}" has been verified. Payment of ₹${amount} has been credited to your wallet/UPI.`,
  }),
};
