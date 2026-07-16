const search = require("./retriever/search");

(async () => {

    const results = await search("What is Seed?");

    console.log("\nTop Results\n");

    results.forEach((result, index) => {

        console.log("====================================");
        console.log(`#${index + 1}`);
        console.log("Source :", result.source);
        console.log("Score  :", result.score.toFixed(3));
        console.log(result.text);
        console.log();

    });

})();