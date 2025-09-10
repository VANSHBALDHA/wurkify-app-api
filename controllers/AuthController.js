const UserAuth = require("../models/AuthUsers");
const UserVerification = require("../models/UserVerification");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const config = require("../config/nodemailer");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const UserProfile = require("../models/UserProfile");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";
const JWT_EXPIRES_IN = "7d";

const sendOtpEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: config.emailUser,
      pass: config.emailPassword,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const mailOptions = {
    from: `"Wurkify App" <${config.emailUser}>`,
    to: to,
    subject: "Verify Your Email - Wurkify",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #4CAF50;">Welcome to Wurkify!</h2>
        <p>Hi there,</p>
        <p>Thank you for signing up. Please use the following One Time Password (OTP) to verify your email address:</p>
        <p style="font-size: 24px; font-weight: bold; color: #333; text-align: center; margin: 20px 0;">
          ${otp}
        </p>
        <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p>Best regards,<br/>The Wurkify Team</p>
        <hr/>
        <p style="font-size: 12px; color: #999;">If you have any questions, contact us at support@wurkify.com</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendResetOtpEmail = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: config.emailUser,
      pass: config.emailPassword,
    },
  });

  const mailOptions = {
    from: `"Wurkify App" <${config.emailUser}>`,
    to: to,
    subject: "Password Reset OTP - Wurkify",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #4CAF50;">Reset Your Password</h2>
        <p>Hi there,</p>
        <p>Please use the following One Time Password (OTP) to reset your password:</p>
        <p style="font-size: 24px; font-weight: bold; color: #333; text-align: center; margin: 20px 0;">
          ${otp}
        </p>
        <p>This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p>Best regards,<br/>The Wurkify Team</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, birthdate, gender, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const existingUser = await UserAuth.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered",
      });
    }

    if (phone) {
      if (!/^\d{10,15}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format",
        });
      }

      const existingPhoneUser = await UserAuth.findOne({ phone });
      if (existingPhoneUser) {
        return res.status(400).json({
          success: false,
          message: "Phone number is already registered",
        });
      }
    }

    if (gender && !["male", "female", "other"].includes(gender.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Gender must be 'male', 'female', or 'other'",
      });
    }

    if (role && !["seeker", "organizer"].includes(role.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'seeker' or 'organizer'",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let parsedBirthdate = null;

    if (birthdate) {
      const m = moment(birthdate, "DD-MM-YYYY", true);
      if (!m.isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid birthdate format. Use DD-MM-YYYY",
        });
      }
      parsedBirthdate = m.toDate();
    }

    const newUser = await UserAuth.create({
      name,
      email,
      password: hashedPassword,
      phone,
      birthdate: parsedBirthdate,
      gender: gender || null,
      role: role || "seeker",
      isVerified: false,
    });

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    await UserVerification.create({
      userId: newUser._id,
      otp,
    });

    await sendOtpEmail(email, otp);

    res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your email.",
      userId: newUser._id,
      newUser,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const record = await UserVerification.findOne({
      userId: user._id,
      otp,
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    if (record.expiresAt && record.expiresAt < Date.now()) {
      await UserVerification.deleteMany({ userId: user._id });
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    await UserAuth.updateOne({ _id: user._id }, { $set: { isVerified: true } });

    await UserVerification.deleteMany({ userId: user._id });

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const userLogin = async (req, res) => {
  try {
    const { email, password, fcm_token } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Email not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email with OTP before logging in",
      });
    }

    if (fcm_token) {
      await UserProfile.findOneAndUpdate(
        { userId: user._id },
        { fcm_token },
        { upsert: true, new: true, runValidators: true }
      );
    }

    const userProfile = await UserProfile.findOne({ userId: user._id });

    const token = jwt.sign(
      {
        _id: user._id.toString(),
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    user.token = token;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        birthdate: user.birthdate,
        gender: user.gender,
        fcm_token: fcm_token || null,
        profile_img: userProfile?.profile_img || null,
      },
    });
  } catch (err) {
    console.error("❌ Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email not found" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    await UserVerification.findOneAndUpdate(
      { userId: user._id },
      { otp },
      { upsert: true, new: true }
    );

    await sendResetOtpEmail(email, otp);

    res.status(200).json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const verifyForgotOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Email and OTP are required" });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email not found" });
    }

    const record = await UserVerification.findOne({ userId: user._id, otp });
    if (!record) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Email not found" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await UserAuth.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );
    await UserVerification.deleteMany({ userId: user._id });

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await UserAuth.deleteOne({ _id: userId });
    await UserVerification.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const changePin = async (req, res) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;

    if (!userId || !oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "userId, oldPassword, and newPassword are required",
      });
    }

    const user = await UserAuth.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Old password is incorrect",
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedNewPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "PIN (password) changed successfully",
    });
  } catch (err) {
    console.error("Change PIN error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const resetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await UserAuth.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User already verified. Please login.",
      });
    }

    // Generate new OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Save/Update OTP record
    await UserVerification.findOneAndUpdate(
      { userId: user._id },
      { otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // Send email
    await sendOtpEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: "A new OTP has been sent to your email",
    });
  } catch (err) {
    console.error("Reset OTP Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

module.exports = {
  registerUser,
  verifyOtp,
  userLogin,
  forgotPassword,
  resetOtp,
  verifyForgotOtp,
  resetPassword,
  deleteAccount,
  changePin,
};
