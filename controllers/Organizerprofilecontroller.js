const jwt = require("jsonwebtoken");
const UserAuth = require("../models/AuthUsers");
const UserProfile = require("../models/UserProfile");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

/**
 * Check organizer profile completion status
 * Required fields: documentation (aadharNumber, aadharImage, panNumber, panImage), bankDetails (all fields)
 * Optional fields: workExperience, socialLinks, education
 */
const checkOrganizerProfileCompletion = async (req, res) => {
  try {
    // ✅ Authorization
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Session expired. Please log in again.",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
        });
      }
      return res.status(401).json({
        success: false,
        message: "Authentication failed.",
      });
    }

    const userId = decoded._id;

    // ✅ Verify user exists and is an organizer
    const user = await UserAuth.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role !== "organizer") {
      return res.status(403).json({
        success: false,
        message: "Only organizers can access this endpoint",
      });
    }

    // ✅ Fetch user profile
    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found. Please create your profile first.",
        isComplete: false,
        missingFields: {
          required: ["documentation", "bankDetails"],
          optional: ["workExperience", "socialLinks", "education"],
        },
      });
    }

    // ✅ Check required fields
    const missingRequired = [];
    const missingOptional = [];
    const completedOptional = [];

    // Check documentation (required)
    const docMissing = [];
    if (!profile.documentation?.aadharNumber) docMissing.push("aadharNumber");
    if (!profile.documentation?.aadharImage) docMissing.push("aadharImage");
    if (!profile.documentation?.panNumber) docMissing.push("panNumber");
    if (!profile.documentation?.panImage) docMissing.push("panImage");

    if (docMissing.length > 0) {
      missingRequired.push({
        section: "documentation",
        fields: docMissing,
      });
    }

    // Check bank details (required)
    const bankMissing = [];
    if (!profile.bankDetails?.accountNumber) bankMissing.push("accountNumber");
    if (!profile.bankDetails?.ifscCode) bankMissing.push("ifscCode");
    if (!profile.bankDetails?.bankName) bankMissing.push("bankName");
    if (!profile.bankDetails?.branchName) bankMissing.push("branchName");
    if (!profile.bankDetails?.accountHolderName)
      bankMissing.push("accountHolderName");
    if (!profile.bankDetails?.upiId) bankMissing.push("upiId");
    if (!profile.bankDetails?.upiNumber) bankMissing.push("upiNumber");

    if (bankMissing.length > 0) {
      missingRequired.push({
        section: "bankDetails",
        fields: bankMissing,
      });
    }

    // ✅ Check optional fields (for informational purposes)
    // Work Experience
    if (!profile.workExperience || profile.workExperience.length === 0) {
      missingOptional.push("workExperience");
    } else {
      completedOptional.push("workExperience");
    }

    // Social Links
    const hasSocialLinks =
      profile.socialLinks?.instagram ||
      profile.socialLinks?.twitter ||
      profile.socialLinks?.facebook ||
      profile.socialLinks?.linkedin;

    if (!hasSocialLinks) {
      missingOptional.push("socialLinks");
    } else {
      completedOptional.push("socialLinks");
    }

    // Education
    const hasEducation =
      profile.education?.degree ||
      profile.education?.institute ||
      profile.education?.graduationYear;

    if (!hasEducation) {
      missingOptional.push("education");
    } else {
      completedOptional.push("education");
    }

    // ✅ Determine completion status
    const isComplete = missingRequired.length === 0;
    const completionPercentage = calculateCompletionPercentage(
      missingRequired,
      missingOptional,
      completedOptional,
    );

    // ✅ Return response
    return res.status(200).json({
      success: true,
      isComplete,
      completionPercentage,
      profile: {
        name: profile.name || user.name,
        email: profile.email || user.email,
        phone: profile.phone || user.phone,
        profile_img: profile.profile_img || null,
      },
      required: {
        documentation: {
          isComplete: docMissing.length === 0,
          missing: docMissing,
        },
        bankDetails: {
          isComplete: bankMissing.length === 0,
          missing: bankMissing,
        },
      },
      optional: {
        workExperience: {
          isComplete: !missingOptional.includes("workExperience"),
          count: profile.workExperience?.length || 0,
        },
        socialLinks: {
          isComplete: !missingOptional.includes("socialLinks"),
          provided: getSocialLinksProvided(profile.socialLinks),
        },
        education: {
          isComplete: !missingOptional.includes("education"),
          hasData: hasEducation,
        },
      },
      missingFields: {
        required: missingRequired,
        optional: missingOptional,
      },
      message: isComplete
        ? "Profile is complete"
        : "Please complete the required fields to activate your organizer account",
    });
  } catch (err) {
    console.error("Check Organizer Profile Completion Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/**
 * Helper function to calculate completion percentage
 * Required fields: 70% weight
 * Optional fields: 30% weight
 */
function calculateCompletionPercentage(
  missingRequired,
  missingOptional,
  completedOptional,
) {
  const totalRequiredSections = 2; // documentation + bankDetails
  const totalOptionalSections = 3; // workExperience + socialLinks + education

  const completedRequired = totalRequiredSections - missingRequired.length;
  const requiredPercent = (completedRequired / totalRequiredSections) * 70;

  const optionalPercent =
    (completedOptional.length / totalOptionalSections) * 30;

  return Math.round(requiredPercent + optionalPercent);
}

/**
 * Helper function to get list of provided social links
 */
function getSocialLinksProvided(socialLinks) {
  const provided = [];
  if (socialLinks?.instagram) provided.push("instagram");
  if (socialLinks?.twitter) provided.push("twitter");
  if (socialLinks?.facebook) provided.push("facebook");
  if (socialLinks?.linkedin) provided.push("linkedin");
  return provided;
}

module.exports = {
  checkOrganizerProfileCompletion,
};
