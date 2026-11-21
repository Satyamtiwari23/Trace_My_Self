const {
    parsePhoneNumberFromString
} = require("libphonenumber-js");


// =====================================
// Email Normalization
// =====================================

function normalizeEmail(email) {
    return email
        .trim()
        .toLowerCase();
}


// =====================================
// Phone Normalization
// =====================================

function normalizePhone(phone) {
    const phoneNumber = parsePhoneNumberFromString(phone, "IN");

    if (!phoneNumber) {
        return null;
    }

    return phoneNumber.number;
}


module.exports = {
    normalizeEmail,
    normalizePhone
};