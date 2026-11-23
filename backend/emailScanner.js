
const dns = require("dns").promises;
const validator = require("validator");

async function checkDomain(email) {
    const domain = email.split("@")[1];

    try {
        const records = await dns.resolveMx(domain);

        return {
            source: "DNS / MX",
            title: "Mail Server Records",
            description: "Email domain has valid mail exchange records.",
            risk: "low",
            status: "info",
            evidence: `${records.length} MX records detected`
        };
    } catch (error) {
        return {
            source: "DNS / MX",
            title: "Mail Server Records",
            description: "No MX records could be retrieved.",
            risk: "low",
            status: "unavailable",
            evidence: "MX lookup unsuccessful"
        };
    }
}

async function checkXposedOrNot(email) {
    try {
        const url =
            "https://api.xposedornot.com/v1/breach-analytics?email=" +
            encodeURIComponent(email);

        const response = await fetch(url, {
            headers: {
                Accept: "application/json"
            },
            signal: AbortSignal.timeout(15000)
        });

        if (response.status === 404) {
            return {
                status: "not_found",
                findings: []
            };
        }

        if (response.status === 429) {
            return {
                status: "unavailable",
                message: "XposedOrNot rate limit reached."
            };
        }

        if (!response.ok) {
            return {
                status: "unavailable",
                message: `XposedOrNot returned ${response.status}`
            };
        }

        const data = await response.json();

        const breaches =
            data.ExposedBreaches?.breaches_details || [];

        const providerRisk =
            data.BreachMetrics?.risk?.[0] || {};

        const findings = breaches.map(breach => {
            const exposedData = (
                breach.xposed_data || ""
            ).split(";").map(item => item.trim()).filter(Boolean);

            return {
                source: "XposedOrNot",
                title: breach.breach || "Unknown breach",
                description:
                    breach.details || "Reported data breach.",
                risk: "medium",
                status: "found",

                evidence: {
                    industry: breach.industry || "Unknown",
                    domain: breach.domain || "Unknown",
                    breachDate: breach.xposed_date || "Unknown",
                    addedDate: breach.added || "Unknown",
                    affectedRecords: breach.xposed_records ?? null,
                    exposedData,
                    verified: breach.verified || "Unknown",
                    passwordRisk: breach.password_risk || "Unknown",
                    reference: breach.references || null,
                    providerRiskLabel:
                        providerRisk.risk_label || "Unknown",
                    providerRiskScore:
                        providerRisk.risk_score ?? null
                }
            };
        });

        return {
            status: findings.length ? "found" : "not_found",
            findings
        };

    } catch (error) {
        console.error("XposedOrNot Error:", error.message);

        return {
            status: "unavailable",
            message: "Unable to connect to XposedOrNot."
        };
    }
}

async function emailScanner(email) {
    if (!validator.isEmail(email)) {
        return {
            valid: false,
            message: "Please enter a valid email address."
        };
    }

    const [domainResult, breachResult] = await Promise.all([
        checkDomain(email),
        checkXposedOrNot(email)
    ]);

    const findings = [domainResult];

    if (breachResult.status === "found") {
        findings.push(...breachResult.findings);
    }

    return {
        valid: true,

        metadata: {
            email,
            domain: email.split("@")[1]
        },

        providers: {
            dns: domainResult.status,
            xposedornot: breachResult.status
        },

        findings
    };
}

module.exports = emailScanner;
