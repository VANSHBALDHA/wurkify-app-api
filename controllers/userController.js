const UserAuth = require("../models/AuthUsers");
const jwt = require("jsonwebtoken");
const UserProfile = require("../models/UserProfile");

const JWT_SECRET = process.env.JWT_SECRET || "wurkifyapp";

const searchUsers = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUserId = decoded._id;

    const { query } = req.body;

    console.log("Search Query:", query);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid name to search.",
      });
    }

    // ✅ Find users whose name matches (case-insensitive)
    const users = await UserAuth.find({
      name: { $regex: query, $options: "i" },
      _id: { $ne: currentUserId }, // exclude the requester
    }).select("_id name email role");

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No users found matching your search.",
        results: [],
      });
    }

    // ✅ Add profile image if available
    const results = await Promise.all(
      users.map(async (user) => {
        const profile = await UserProfile.findOne(
          { userId: user._id },
          "profile_img"
        );

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          profile_img: profile ? profile.profile_img : null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully.",
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("Search Users Error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  searchUsers,
};
