
const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

// ==================================
// Website Name
// ==================================

function getWebsiteName(url) {
    try {
        const hostname = new URL(url).hostname
            .toLowerCase()
            .replace(/^www\./, "");

        const websites = {
            "linkedin.com": "LinkedIn",
            "github.com": "GitHub",
            "gitlab.com": "GitLab",
            "groups.google.com": "Google Groups",
            "google.com": "Google",
            "facebook.com": "Facebook",
            "instagram.com": "Instagram",
            "twitter.com": "Twitter",
            "x.com": "X",
            "reddit.com": "Reddit",
            "youtube.com": "YouTube",
            "medium.com": "Medium",
            "commudle.com": "Commudle",
            "quora.com": "Quora"
        };

        for (const domain in websites) {
            if (
                hostname === domain ||
                hostname.endsWith("." + domain)
            ) {
                return websites[domain];
            }
        }

        return hostname;

    } catch (error) {
        return "Unknown Website";
    }
}

// ==================================
// Normalize URL
// ==================================

function normalizeUrl(url) {
    try {
        const parsedUrl = new URL(url);

        parsedUrl.hash = "";

        return parsedUrl.toString();

    } catch (error) {
        return null;
    }
}

// ==================================
// Tavily Search
// ==================================

async function searchTavily(query, apiKey) {
    const response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },

        body: JSON.stringify({
            query: query,
            search_depth: "basic",
            topic: "general",
            max_results: 10,
            include_answer: false,
            include_raw_content: false
        })
    });

    if (!response.ok) {
        throw new Error(
            `Tavily Search Error: ${response.status}`
        );
    }

    return await response.json();
}

// ==================================
// Tavily Extract
// ==================================

async function extractTavily(urls, apiKey) {
    const response = await fetch(TAVILY_EXTRACT_URL, {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },

        body: JSON.stringify({
            urls: urls,
            extract_depth: "basic",
            format: "text"
        })
    });

    if (!response.ok) {
        throw new Error(
            `Tavily Extract Error: ${response.status}`
        );
    }

    return await response.json();
}

// ==================================
// Main Email Search Function
// ==================================

async function searchWebByEmail(email) {

    // Validate email input

    if (!email || typeof email !== "string") {
        throw new Error("Valid email is required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Get API key

    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey) {
        throw new Error("TAVILY_API_KEY is missing.");
    }

    // ==================================
    // Step 1: Create Search Queries
    // ==================================

    const queries = [
        `"${normalizedEmail}"`,
        `"${normalizedEmail}" profile`,
        `"${normalizedEmail}" contact`
    ];

    // ==================================
    // Step 2: Run All Searches
    // ==================================

    const searchResponses = await Promise.allSettled(
        queries.map(query => searchTavily(query, apiKey))
    );

    const successfulSearches = searchResponses.filter(
        result => result.status === "fulfilled"
    );

    if (successfulSearches.length === 0) {
        throw new Error("All Tavily search requests failed.");
    }

    // ==================================
    // Step 3: Merge Unique URLs
    // ==================================

    const uniqueUrls = new Map();

    for (const search of successfulSearches) {

        const searchResults = search.value.results || [];

        for (const item of searchResults) {

            if (!item.url) {
                continue;
            }

            const url = normalizeUrl(item.url);

            if (!url) {
                continue;
            }

            if (!uniqueUrls.has(url)) {
                uniqueUrls.set(url, url);
            }
        }
    }

    const urls = Array.from(uniqueUrls.values());

    // No search results

    if (urls.length === 0) {
        return {
            platform: "General Web",
            totalCount: 0,
            verifiedCount: 0,
            results: []
        };
    }

    // ==================================
    // Step 4: Extract Webpage Content
    // ==================================

    const extractedMap = new Map();

    // Process URLs in batches of 20

    const batchSize = 20;

    for (let i = 0; i < urls.length; i += batchSize) {

        const batch = urls.slice(i, i + batchSize);

        try {

            const extractData = await extractTavily(
                batch,
                apiKey
            );

            const extractedResults = extractData.results || [];

            for (const item of extractedResults) {

                if (!item.url) {
                    continue;
                }

                const url = normalizeUrl(item.url);

                if (!url) {
                    continue;
                }

                extractedMap.set(
                    url,
                    item.raw_content || ""
                );
            }

        } catch (error) {

            // If one extraction batch fails,
            // continue processing the remaining batches.

            console.error(
                "Extraction batch failed:",
                error.message
            );
        }
    }

    // ==================================
    // Step 5: Verify Exact Email
    // ==================================

    const results = [];

    let verifiedCount = 0;

    for (const url of urls) {

        const pageContent = extractedMap.get(url) || "";

        const verified = pageContent
            .toLowerCase()
            .includes(normalizedEmail);

        if (verified) {
            verifiedCount++;
        }

        results.push({
            website: getWebsiteName(url),
            url: url,
            verified: verified
        });
    }

    // ==================================
    // Step 6: Final Response
    // ==================================

    return {
        platform: "General Web",
        totalCount: results.length,
        verifiedCount: verifiedCount,
        results: results
    };
}

// ==================================
// Export Function
// ==================================

module.exports = {
    searchWebByEmail
};
