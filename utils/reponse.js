const successResponse = (res, data, message = "Success") => {
  res.status(200).json({ message, data });
};

const errorResponse = (res, error, message = "Something went wrong") => {
  res.status(500).json({ message, error });
};

module.exports = { successResponse, errorResponse };
