
const express = require("express");

const router = express.Router();

// ==================================
// Utilities
// ==================================

const {
    validateEmail,
    validatePhone
} = require("../utils/validator");

const {
    normalizeEmail,
    normalizePhone
} = require("../utils/normalizer");

// ==================================
// Processors
// ==================================

const {
    extractDomain,
    generateEmailHash,
    analyzeMX
} = require("../processors/emailProcessor");

const {
    processPhone
} = require("../processors/phoneProcessor");

// ==================================
// Scan API
// ==================================

router.post("/scan", async (req, res) => {
    try {
        const { email, phone } = req.body;

        // ==================================
        // 1. Required Input Check
        // ==================================

        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                message: "Please provide an email or phone number"
            });
        }

        // ==================================
        // 2. Email Validation & Normalization
        // ==================================

        let normalizedEmail = null;
        let emailResult = null;

        if (email) {
            if (typeof email !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Email must be a string"
                });
            }

            normalizedEmail = normalizeEmail(email);

            if (!validateEmail(normalizedEmail)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid email address"
                });
            }

            // ==================================
            // 3. Email Processor
            // ==================================

            const domain = extractDomain(normalizedEmail);

            const hash = generateEmailHash(normalizedEmail);

            const mxAnalysis = await analyzeMX(domain);

            emailResult = {
                value: normalizedEmail,
                domain: domain,
                sha256: hash,
                mx: mxAnalysis
            };
        }

        // ==================================
        // 4. Phone Validation & Normalization
        // ==================================

        let normalizedPhone = null;
        let phoneResult = null;

        if (phone) {
            if (typeof phone !== "string") {
                return res.status(400).json({
                    success: false,
                    message: "Phone number must be a string"
                });
            }

            normalizedPhone = normalizePhone(phone);

            if (!normalizedPhone || !validatePhone(normalizedPhone)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number"
                });
            }

            // ==================================
            // 5. Phone Processor
            // ==================================

            phoneResult = processPhone(normalizedPhone);

            if (!phoneResult || !phoneResult.isValid) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid phone number"
                });
            }
        }

        // ==================================
        // 6. Final Response
        // ==================================

        return res.status(200).json({
            success: true,
            message: "Input processed successfully",
            data: {
                email: emailResult,
                phone: phoneResult
            }
        });

    } catch (error) {
        console.error("Scan API Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

module.exports = router;
