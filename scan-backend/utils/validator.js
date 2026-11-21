const {
    parsePhoneNumberFromString
} = require("libphonenumber-js");


// =====================================
// Email Validation
// =====================================

function validateEmail(email) {
    if (!email || typeof email !== "string") {
        return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailPattern.test(email);
}


// =====================================
// Phone Validation
// =====================================

function validatePhone(phone) {
    if (!phone || typeof phone !== "string") {
        return false;
    }

    const phoneNumber = parsePhoneNumberFromString(phone, "IN");

    if (!phoneNumber) {
        return false;
    }

    return phoneNumber.isValid();
}


module.exports = {
    validateEmail,
    validatePhone
};