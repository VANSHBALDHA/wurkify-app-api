exports.organizerMessages = {
  createEvent: (eventName) => ({
    title: "Event Created",
    message: `Your event "${eventName}" has been created successfully.`,
  }),

  newApplicants: (eventName, count) => ({
    title: "New Applicants",
    message: `You have ${count} new applicants for your event "${eventName}". Review them now.`,
  }),

  acceptApplicant: (eventName, seekerName) => ({
    title: "Applicant Accepted",
    message: `You have successfully accepted ${seekerName} for your event "${eventName}".`,
  }),

  rejectApplicant: (eventName, seekerName) => ({
    title: "Applicant Rejected",
    message: `You have rejected ${seekerName} for your event "${eventName}".`,
  }),

  groupCreated: (eventName) => ({
    title: "Group Chat Created",
    message: `A group chat has been created for your event "${eventName}". Communicate with your selected team easily.`,
  }),

  attendanceReminder: (eventName) => ({
    title: "Verify Attendance",
    message: `Reminder: Verify attendance for your event "${eventName}" today.`,
  }),

  attendanceCheckin: (eventName, seekerName) => ({
    title: "Seeker Check-in",
    message: `${seekerName} has checked in for your event "${eventName}". Please verify attendance.`,
  }),

  payReminder: (eventName) => ({
    title: "Release Payments",
    message: `Verify work and release payments for your seekers in event "${eventName}".`,
  }),

  paySuccess: (eventName, seekerName, amount) => ({
    title: "Payment Successful",
    message: `You have successfully paid ${seekerName} ₹${amount} for your event "${eventName}".`,
  }),

  groupDeleted: (eventName) => ({
    title: "Group Closed",
    message: `The group chat for event "${eventName}" has been closed after payments. Thank you for using Wurkify.`,
  }),
};
