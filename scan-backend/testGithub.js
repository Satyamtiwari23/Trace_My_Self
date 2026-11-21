
const searchGitHubByEmail = require("./discovery/github");

async function test() {

    const email = "sttiwari9211@gmail.com";

    const result = await searchGitHubByEmail(email);

    console.log(JSON.stringify(result, null, 2));
}

test();
