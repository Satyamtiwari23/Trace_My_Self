
const GITHUB_API = "https://api.github.com/search/commits";

// Search GitHub commits using an exact email address
async function searchGitHubByEmail(email) {
    try {
        const normalizedEmail = email.trim().toLowerCase();

        // Search author and committer separately
        const queries = [
            `author-email:${normalizedEmail}`,
            `committer-email:${normalizedEmail}`
        ];

        const headers = {
            Accept: "application/vnd.github+json"
        };

        // Optional GitHub token for authenticated API access
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        // Execute both searches simultaneously
        const responses = await Promise.all(
            queries.map(query =>
                fetch(
                    `${GITHUB_API}?q=${encodeURIComponent(query)}&per_page=100`,
                    { headers }
                )
            )
        );

        // Check API responses
        for (const response of responses) {
            if (!response.ok) {
                throw new Error(
                    `GitHub API error: ${response.status}`
                );
            }
        }

        const data = await Promise.all(
            responses.map(response => response.json())
        );

        // Combine results from both searches
        const allCommits = data.flatMap(item => item.items || []);

        // Remove duplicate commits
        const uniqueCommits = [
            ...new Map(
                allCommits.map(commit => [commit.sha, commit])
            ).values()
        ];

        // Store discovered accounts and unlinked commits
        const accounts = new Map();
        const unlinkedCommits = [];

        for (const commit of uniqueCommits) {

            const authorEmail =
                commit.commit?.author?.email?.toLowerCase();

            const committerEmail =
                commit.commit?.committer?.email?.toLowerCase();

            // Verify exact email matches
            const authorMatch = authorEmail === normalizedEmail;
            const committerMatch = committerEmail === normalizedEmail;

            if (!authorMatch && !committerMatch) {
                continue;
            }

            const matchedAs = [];

            if (authorMatch) matchedAs.push("author");
            if (committerMatch) matchedAs.push("committer");

            // Connect only the GitHub users linked to matching sides
            const linkedUsers = [];

            if (authorMatch && commit.author?.login) {
                linkedUsers.push({
                    user: commit.author,
                    role: "author"
                });
            }

            if (committerMatch && commit.committer?.login) {
                linkedUsers.push({
                    user: commit.committer,
                    role: "committer"
                });
            }

            // Prepare commit evidence
            const evidence = {
                repository: commit.repository?.full_name || null,
                repositoryUrl: commit.repository?.html_url || null,
                commitUrl: commit.html_url || null,
                matchedAs
            };

            // No linked GitHub account
            if (linkedUsers.length === 0) {
                unlinkedCommits.push(evidence);
                continue;
            }

            // Save matching GitHub accounts
            for (const linked of linkedUsers) {
                const user = linked.user;
                const username = user.login;

                if (!accounts.has(username)) {
                    accounts.set(username, {
                        platform: "GitHub",
                        username,
                        profileUrl: user.html_url,
                        avatarUrl: user.avatar_url || null,
                        evidence: []
                    });
                }

                accounts.get(username).evidence.push({
                    ...evidence,
                    matchedAs: [linked.role]
                });
            }
        }

        const discoveredAccounts = [...accounts.values()];

        const totalCommits =
            uniqueCommits.filter(commit => {
                const authorEmail =
                    commit.commit?.author?.email?.toLowerCase();

                const committerEmail =
                    commit.commit?.committer?.email?.toLowerCase();

                return (
                    authorEmail === normalizedEmail ||
                    committerEmail === normalizedEmail
                );
            }).length;

        return {
            platform: "GitHub",

            status: totalCommits > 0 ? "found" : "not_found",

            accountStatus:
                discoveredAccounts.length > 0
                    ? "account_found"
                    : totalCommits > 0
                        ? "account_unverified"
                        : "no_public_evidence",

            totalCommits,
            totalAccounts: discoveredAccounts.length,

            partial: data.some(item => item.incomplete_results === true),

            accounts: discoveredAccounts,

            unlinkedCommits
        };

    } catch (error) {
        console.error("GitHub discovery error:", error.message);

        return {
            platform: "GitHub",
            status: "error",
            accountStatus: "unverified",
            partial: true,
            totalCommits: 0,
            totalAccounts: 0,
            accounts: [],
            unlinkedCommits: [],
            error: error.message
        };
    }
}

module.exports = searchGitHubByEmail;
