const { chromium } = require("playwright");
const fs = require("fs");

const discoverPages = require("./crawler");
const extractContent = require("./extract");

const OUTPUT_DIR = "./data";

(async () => {

    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true
    });

    const pages = await discoverPages(browser);

    console.log(`\nFound ${pages.length} pages\n`);

    for (const url of pages) {

        console.log("--------------------------------");
        console.log("Scraping:", url);

        const page = await browser.newPage();

        try {

            await page.goto(url, {
                waitUntil: "load",
                timeout: 60000
            });

            const text = await extractContent(page);

            const filename =
                url === "https://www.mintzy.in/"
                    ? "home.txt"
                    : url
                          .replace("https://www.mintzy.in/", "")
                          .replace(/\//g, "_") + ".txt";

            fs.writeFileSync(
                `${OUTPUT_DIR}/${filename}`,
                text,
                "utf8"
            );

            console.log("✓ Saved:", filename);

        } catch (err) {

            console.log("✗ Failed:", url);
            console.log(err.message);

        }

        await page.close();
    }

    await browser.close();

    console.log("\n================================");
    console.log("Scraping Finished");
    console.log("================================");

})();