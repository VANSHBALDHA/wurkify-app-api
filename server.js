const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const errorMiddleware = require("./middlewares/errorMiddleware");
const cors = require("cors");
const NodeCache = require("node-cache");
const cookieParser = require("cookie-parser");

dotenv.config();

connectDB();

const app = express();

var corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cache = new NodeCache();

app.delete("/api/cache/clear", (req, res) => {
  cache.flushAll();
  res.status(200).json({ message: "Cache cleared successfully!" });
});

app.use("/api/auth", require("./routes/authRoutes"));

app.use(cookieParser());

app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
