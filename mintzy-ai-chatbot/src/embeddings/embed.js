require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { InferenceClient } = require("@huggingface/inference");

const client = new InferenceClient(process.env.HF_TOKEN);

const INPUT = path.join(__dirname, "chunks.json");
const OUTPUT = path.join(__dirname, "../../data/embeddings.json");

async function main() {

    const chunks = JSON.parse(
        fs.readFileSync(INPUT, "utf8")
    );

    const embedded = [];

    for (let i = 0; i < chunks.length; i++) {

        console.log(
            `[${i + 1}/${chunks.length}] ${chunks[i].source}`
        );

        const vector = await client.featureExtraction({

            model: "sentence-transformers/all-MiniLM-L6-v2",

            inputs: chunks[i].text

        });

        embedded.push({

            ...chunks[i],

            embedding: vector

        });

    }

    fs.writeFileSync(

        OUTPUT,

        JSON.stringify(embedded)

    );

    console.log("\nEmbeddings Created Successfully!");
    console.log(`Saved -> ${OUTPUT}`);

}

main().catch(console.error);