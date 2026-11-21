require("dotenv").config();

const { searchWebByEmail } = require("./discovery/search");

async function test() {
    const email = "your_test_email@gmail.com";

    const result = await searchWebByEmail(email);

    console.log(JSON.stringify(result, null, 2));
}

test();