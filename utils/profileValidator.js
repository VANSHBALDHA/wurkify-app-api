function checkProfileCompletion(user, profile) {
  if (!user || !profile) {
    return { isComplete: false, missingFields: ["profile"] };
  }

  const fieldsMap = {
    name: user.name,
    email: user.email,
    phone: user.phone,
    birthdate: user.birthdate,
    gender: user.gender,
    profile_img: profile.profile_img,
    age: profile.age,
    weight: profile.weight,
    height: profile.height,
    state: profile.state,
    city: profile.city,

    // Documentation
    aadharNumber: profile.documentation?.aadharNumber,
    panNumber: profile.documentation?.panNumber,
    streetAddress: profile.documentation?.streetAddress,
    docCity: profile.documentation?.city,
    docState: profile.documentation?.state,
    pincode: profile.documentation?.pincode,

    // Bank Details
    accountNumber: profile.bankDetails?.accountNumber,
    ifscCode: profile.bankDetails?.ifscCode,
    bankName: profile.bankDetails?.bankName,
    branchName: profile.bankDetails?.branchName,
    accountHolderName: profile.bankDetails?.accountHolderName,
    upiId: profile.bankDetails?.upiId,
    upiNumber: profile.bankDetails?.upiNumber,
  };

  const missingFields = Object.entries(fieldsMap)
    .filter(([_, value]) => !value || value === "")
    .map(([key]) => key);

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}
