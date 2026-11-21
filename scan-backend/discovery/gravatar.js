
const crypto = require("crypto");

async function searchGravatarByEmail(email) {
    try {

        // Step 1: Normalize email
        const normalizedEmail = email.trim().toLowerCase();

        // Step 2: Generate SHA-256 hash
        const emailHash = crypto
            .createHash("sha256")
            .update(normalizedEmail)
            .digest("hex");

        // Step 3: Create Gravatar API URL
        const apiUrl =
            `https://api.gravatar.com/v3/profiles/${emailHash}`;

        // Step 4: Prepare API headers
        const headers = {
            Accept: "application/json"
        };

        // Add API key if available
        if (process.env.GRAVATAR_API_KEY) {
            headers.Authorization =
                `Bearer ${process.env.GRAVATAR_API_KEY}`;
        }

        // Step 5: Send request to Gravatar
        const response = await fetch(apiUrl, {
            method: "GET",
            headers
        });

        // Step 6: Check whether profile exists
        if (response.status === 404) {
            return {
                platform: "Gravatar",
                status: "not_found",
                partial: false,
                totalCount: 0,
                results: []
            };
        }

        // Handle other API errors
        if (!response.ok) {
            throw new Error(
                `Gravatar API error: ${response.status}`
            );
        }

        // Step 7: Read profile information
        const profile = await response.json();

        // Step 8: Prepare discovery result
        return {
            platform: "Gravatar",
            status: "found",
            partial: false,
            totalCount: 1,

            results: [
                {
                    platform: "Gravatar",
                    status: "found",

                    displayName: profile.display_name || null,

                    profileUrl: profile.profile_url || null,

                    avatarUrl: profile.avatar_url || null,

                    description: profile.description || null,

                    location: profile.location || null,

                    evidence:
                        "Gravatar profile found using SHA-256 email hash",

                    confidence: "high"
                }
            ]
        };

    } catch (error) {

        console.error(
            "Gravatar discovery error:",
            error.message
        );

        return {
            platform: "Gravatar",
            status: "error",
            partial: true,
            totalCount: 0,
            results: [],
            error: error.message
        };
    }
}

module.exports = searchGravatarByEmail;
