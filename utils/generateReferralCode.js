module.exports = function generateReferralCode(name, userId) {
  const prefix = name ? name.slice(0, 3).toUpperCase() : "USR";
  const unique = userId.toString().slice(-4);
  const random = Math.floor(100 + Math.random() * 900);
  return `${prefix}${unique}${random}`;
};
