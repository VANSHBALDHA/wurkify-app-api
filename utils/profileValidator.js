function isProfileComplete(profile) {
  if (!profile) return false;

  const requiredFields = [
    profile.profile_img,
    profile.name,
    profile.email,
    profile.phone,
    profile.birthdate,
    profile.age,
    profile.gender,
    profile.weight,
    profile.height,
    profile.state,
    profile.city,

    // Documentation
    profile.documentation?.aadharNumber,
    profile.documentation?.panNumber,
    profile.documentation?.streetAddress,
    profile.documentation?.city,
    profile.documentation?.state,
    profile.documentation?.pincode,

    // Bank Details
    profile.bankDetails?.accountNumber,
    profile.bankDetails?.ifscCode,
    profile.bankDetails?.bankName,
    profile.bankDetails?.branchName,
    profile.bankDetails?.accountHolderName,
    profile.bankDetails?.upiId,
    profile.bankDetails?.upiNumber,
  ];

  // Check if any required field missing/empty
  return requiredFields.every(
    (field) => field !== null && field !== undefined && field !== ""
  );
}

module.exports = { isProfileComplete };
