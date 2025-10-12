const UserAuth = require("../models/AuthUsers");
const UserProfile = require("../models/UserProfile");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const getProfileDetails = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    if (decoded._id !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this profile",
      });
    }

    const user = await UserAuth.findById(userId);
    const profile = await UserProfile.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      data: {
        user_id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        birthdate: user.birthdate,
        gender: user.gender,
        role: user.role,
        profile_img: profile?.profile_img || "",
        photos: profile?.photos.length > 0 ? profile?.photos : [],

        age: profile?.age || null,
        city: profile?.city || null,
        state: profile?.state || null,
        height: profile?.height || null,
        weight: profile?.weight || null,
        address: profile?.address || null,
        skills: (profile?.skills || []).map((s) => ({
          skillName: s.name,
          proficiency: s.proficiency,
        })),
        education: profile?.education || {},
        socialLinks: profile?.socialLinks || {
          instagram: "",
          twitter: "",
          facebook: "",
          linkedin: "",
        },
        documentation: profile?.documentation || null,
        bankDetails: profile?.bankDetails || null,
        workExperience: profile?.workExperience || [],
      },
    });
  } catch (err) {
    console.error("getProfileDetails error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const upsertProfile = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({
          success: false,
          message: "Authorization token missing or invalid",
        });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    }

    const userId = decoded._id;
    const {
      name,
      email,
      phone,
      birthdate,
      age,
      gender,
      weight,
      state,
      city,
      height,
      skills,
      education,
      address,
    } = req.body;

    let parsedSkills = [];
    let parsedEducation = {};
    let parsedBirthdate = null;

    if (typeof skills === "string") {
      parsedSkills = JSON.parse(skills).map((s) => ({
        name: s.skillName || s.name,
        proficiency: s.proficiency || "",
      }));
    }

    if (typeof education === "string") parsedEducation = JSON.parse(education);

    if (birthdate) {
      const m = moment(birthdate, "DD-MM-YYYY", true);
      if (!m.isValid()) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Invalid birthdate format. Use DD-MM-YYYY",
          });
      }
      parsedBirthdate = m.toDate();
    }

    // ✅ Fetch existing profile first
    const existingProfile = await UserProfile.findOne({ userId });

    // ✅ Handle new profile image upload (single)
    let imageUrl = existingProfile?.profile_img || null;
    if (req.files?.profile_img?.length > 0) {
      const file = req.files.profile_img[0];
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "profile_images", resource_type: "image" },
          (error, result) => (result ? resolve(result) : reject(error))
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
      imageUrl = result.secure_url;
    }

    // ✅ Handle multiple gallery photos (replace old ones)
    let uploadedPhotos = [];
    if (req.files?.photos?.length > 0) {
      // 1️⃣ Delete existing photos from Cloudinary
      if (existingProfile?.photos?.length > 0) {
        const deletePromises = existingProfile.photos.map(async (url) => {
          try {
            const publicId = url.split("/").pop().split(".")[0]; // Extract filename
            await cloudinary.uploader.destroy(`user_photos/${publicId}`);
          } catch (err) {
            console.warn("Cloudinary delete failed:", err);
          }
        });
        await Promise.all(deletePromises);
      }

      // 2️⃣ Upload new photos
      const uploadPromises = req.files.photos.map(
        (file) =>
          new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: "user_photos", resource_type: "image" },
              (error, result) =>
                result ? resolve(result.secure_url) : reject(error)
            );
            streamifier.createReadStream(file.buffer).pipe(stream);
          })
      );
      uploadedPhotos = await Promise.all(uploadPromises);
    }

    // ✅ If no new upload, keep old photos
    const finalPhotos =
      uploadedPhotos.length > 0
        ? uploadedPhotos
        : existingProfile?.photos || [];

    // if (finalPhotos.length < 2) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "You must have at least 2 photos in your profile.",
    //   });
    // }

    // ✅ Update / insert profile
    const updateData = {
      ...(imageUrl && { profile_img: imageUrl }),
      ...(name && { name }),
      ...(email && { email }),
      ...(phone && { phone }),
      ...(parsedBirthdate && { birthdate: parsedBirthdate }),
      ...(age && { age }),
      ...(gender && { gender }),
      ...(weight && { weight }),
      ...(state && { state }),
      ...(city && { city }),
      ...(height && { height }),
      ...(parsedSkills.length && { skills: parsedSkills }),
      ...(Object.keys(parsedEducation).length && {
        education: parsedEducation,
      }),
      ...(address && { address }),
      photos: finalPhotos, // ✅ Replace with new or keep old
    };

    const profile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile,
    });
  } catch (err) {
    console.error("upsertProfile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const updateSocialLinks = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = decoded._id;

    const { instagram, twitter, facebook, linkedin } = req.body;

    const updateData = {
      socialLinks: {
        instagram,
        twitter,
        facebook,
        linkedin,
      },
    };

    const updatedProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true }
    );

    if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Social media links updated successfully",
      socialLinks: updatedProfile.socialLinks,
    });
  } catch (err) {
    console.error("updateSocialLinks error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const upsertDocumentation = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = decoded._id;
    const { aadharNumber, panNumber } = req.body;

    if (!aadharNumber || !panNumber) {
      return res.status(400).json({
        success: false,
        message: "All documentation fields are required",
      });
    }

    const aadharRegex = /^\d{12}$/;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    if (!aadharRegex.test(aadharNumber)) {
      return res
        .status(400)
        .json({ success: false, message: "Aadhar number must be 12 digits" });
    }

    if (!panRegex.test(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "PAN must follow format: 5 letters, 4 digits, 1 letter",
      });
    }

    const uploadToCloudinary = (fileBuffer, folder) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: "image" },
          (error, result) => {
            if (result) resolve(result.secure_url);
            else reject(error);
          }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
      });
    };

    let aadharImageUrl = null;
    let panImageUrl = null;

    if (req.files && req.files.aadharImage?.length > 0) {
      aadharImageUrl = await uploadToCloudinary(
        req.files.aadharImage[0].buffer,
        "user_docs"
      );
    }

    if (req.files && req.files.panImage?.length > 0) {
      panImageUrl = await uploadToCloudinary(
        req.files.panImage[0].buffer,
        "user_docs"
      );
    }

    const updateData = {
      documentation: {
        aadharNumber,
        panNumber,
        ...(aadharImageUrl && { aadharImage: aadharImageUrl }),
        ...(panImageUrl && { panImage: panImageUrl }),
      },
    };

    const updatedProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Documentation details saved successfully",
      documentation: updatedProfile.documentation,
    });
  } catch (err) {
    console.error("upsertDocumentation error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const upsertBankDetails = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = decoded._id;

    const {
      accountNumber,
      ifscCode,
      bankName,
      branchName,
      accountHolderName,
      upiId,
      upiNumber,
    } = req.body;

    const errors = [];

    if (!/^\d{9,18}$/.test(accountNumber)) {
      errors.push("Bank account number must be 9 to 18 digits");
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      errors.push("Invalid IFSC code format");
    }

    if (!bankName || bankName.trim().length < 2) {
      errors.push("Bank name is required and must be at least 2 characters");
    }

    if (!branchName || branchName.trim().length < 2) {
      errors.push("Branch name is required and must be at least 2 characters");
    }

    if (!accountHolderName || accountHolderName.trim().length < 3) {
      errors.push(
        "Account holder name is required and must be at least 3 characters"
      );
    }

    if (!/^[\w.-]+@[\w.-]+$/.test(upiId)) {
      errors.push("Invalid UPI ID format (e.g., name@bank)");
    }

    if (!/^\d{10}$/.test(upiNumber)) {
      errors.push("UPI number must be a valid 10-digit phone number");
    }

    if (errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Validation errors", errors });
    }

    const updateData = {
      bankDetails: {
        accountNumber,
        ifscCode,
        bankName: bankName.trim(),
        branchName: branchName.trim(),
        accountHolderName: accountHolderName.trim(),
        upiId,
        upiNumber,
      },
    };

    const updatedProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Bank account details saved successfully",
      bankDetails: updatedProfile.bankDetails,
    });
  } catch (err) {
    console.error("upsertBankDetails error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const upsertWorkExperience = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token missing or invalid",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired token" });
    }

    const userId = decoded._id;

    const {
      jobTitle,
      companyName,
      jobLocation,
      skillsUsed,
      employmentType,
      startDate,
      endDate,
      currentlyWorking,
      jobDescription,
    } = req.body;

    const errors = [];

    if (!jobTitle || jobTitle.trim().length < 2)
      errors.push("Job title is required");
    if (!companyName || companyName.trim().length < 2)
      errors.push("Company name is required");
    if (!jobLocation || jobLocation.trim().length < 2)
      errors.push("Job location is required");
    if (!skillsUsed) errors.push("Skills used is required");
    if (
      !employmentType ||
      !["Full time", "Part time", "Remote"].includes(employmentType)
    ) {
      errors.push("Employment type must be Full time, Part time, or Remote");
    }
    if (!startDate) errors.push("Start date is required");
    if (!currentlyWorking && !endDate)
      errors.push("End date is required if not currently working");

    if (errors.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Validation errors", errors });
    }

    const experienceEntry = {
      jobTitle: jobTitle.trim(),
      companyName: companyName.trim(),
      jobLocation: jobLocation.trim(),
      skillsUsed:
        typeof skillsUsed === "string"
          ? skillsUsed.split(",").map((s) => s.trim())
          : skillsUsed,
      employmentType,
      startDate: new Date(startDate),
      endDate: currentlyWorking ? null : new Date(endDate),
      currentlyWorking: Boolean(currentlyWorking),
      jobDescription: jobDescription?.trim() || "",
    };

    const updatedProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { $push: { workExperience: experienceEntry } },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Work experience added successfully",
      workExperience: updatedProfile.workExperience,
    });
  } catch (err) {
    console.error("upsertWorkExperience error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getProfileDetails,
  upsertProfile,
  updateSocialLinks,
  upsertDocumentation,
  upsertBankDetails,
  upsertWorkExperience,
};
