const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb+srv://baldhavansh2505:5yw0IEhqR6xjG7DB@wurkify-app-api.twbmlro.mongodb.net/?retryWrites=true&w=majority&appName=wurkify-app-api",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  }
};

module.exports = connectDB;
