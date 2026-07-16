const chat = require("./routes/chat");

(async () => {

    const questions = [

        "What is plugin?",

        "What are its features?",

        "What pricing plans are available?",

        "Who is Virat Kohli?"

    ];

    const history = [];

    for (const q of questions) {

        console.log("\n====================================");
        console.log("QUESTION:");
        console.log(q);

        console.log("\nANSWER:\n");

        const answer = await chat(q, history);

        console.log(answer);

        // Strip the footer before pushing to history so it doesn't confuse subsequent turns
        const cleanAnswerForHistory = answer.split("\n\n---\nNeed More Help?")[0];
        history.push({ question: q, answer: cleanAnswerForHistory });

    }

})();