
const searchGravatarByEmail =
    require("./discovery/gravatar");

async function test() {

    const email = "";

    const result = await searchGravatarByEmail(email);

    console.log(
        JSON.stringify(result, null, 2)
    );
}

test();
