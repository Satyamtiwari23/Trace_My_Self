
function calculateRisk(findings) {

    // Step 1: Remove duplicate findings
    const uniqueFindings = [];
    const seenFindings = new Set();

    for (const item of findings) {
        const key = `${item.source}:${item.title}`
            .toLowerCase()
            .trim();

        if (!seenFindings.has(key)) {
            seenFindings.add(key);
            uniqueFindings.push(item);
        }
    }

    // Step 2: Risk points for exposed information
    const weights = {
        "email addresses": 5,
        "names": 5,
        "ids": 5,
        "usernames": 5,
        "phone numbers": 15,
        "physical addresses": 15,
        "geographic locations": 10,
        "passwords": 30,
        "payment details": 30,
        "financial information": 30,
        "auth tokens": 40,
        "authentication tokens": 40,
        "security questions and answers": 25
    };

    // Step 3: Normalize category names
    function normalizeCategory(category) {
        return String(category)
            .toLowerCase()
            .replace(/^data_/, "")
            .replace(/_/g, " ")
            .trim();
    }

    // Step 4: Collect unique exposed categories
    const exposedCategories = new Set();

    for (const item of uniqueFindings) {

        // Only confirmed dataset matches contribute
        if (item.status !== "found") continue;

        const exposedData = item.evidence?.exposedData || [];

        for (const category of exposedData) {
            exposedCategories.add(normalizeCategory(category));
        }
    }

    // Step 5: Calculate risk score
    let score = 0;

    for (const category of exposedCategories) {
        score += weights[category] || 0;
    }

    // Maximum score = 100
    score = Math.min(score, 100);

    // Step 6: Determine risk level
    let level = "LOW";

    if (score >= 50) {
        level = "HIGH";
    } else if (score >= 20) {
        level = "MEDIUM";
    }

    return {
        score,
        level,
        findings: uniqueFindings
    };
}

module.exports = calculateRisk;
