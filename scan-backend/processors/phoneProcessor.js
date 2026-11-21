const {
    parsePhoneNumberFromString
} = require("libphonenumber-js");

// Process phone number
function processPhone(phone) {
    const phoneNumber = parsePhoneNumberFromString(phone, "IN");

    if (!phoneNumber) {
        return null;
    }

    return {
        country: phoneNumber.country,
        countryCallingCode: phoneNumber.countryCallingCode,
        nationalNumber: phoneNumber.nationalNumber,
        e164: phoneNumber.number,
        isValid: phoneNumber.isValid()
    };
}

module.exports = {
    processPhone
};