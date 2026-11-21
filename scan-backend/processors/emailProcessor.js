const crypto = require("crypto");
const dns = require("dns").promises;

// Extract domain from email
function extractDomain(email) {
    return email.split("@")[1];
}

// Generate SHA-256 hash
function generateEmailHash(email) {
    return crypto
        .createHash("sha256")
        .update(email)
        .digest("hex");
}

// Analyze MX records
async function analyzeMX(domain) {
    try {
        const records = await dns.resolveMx(domain);

        return {
            hasMX: records.length > 0,
            records
        };
    } catch (error) {
        return {
            hasMX: false,
            records: []
        };
    }
}

module.exports = {
    extractDomain,
    generateEmailHash,
    analyzeMX
};