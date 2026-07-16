const cleanText = require("./cleaner");
const {
    CONTENT_SELECTORS
} = require("./config");

async function extractContent(page) {

    let finalText = "";

    for (const selector of CONTENT_SELECTORS) {

        const sections = await page.locator(selector).all();

        for (const section of sections) {

            try {

                const text = await section.innerText();

                if (text.trim().length > 50) {

                    finalText += text + "\n\n";

                }

            } catch {}

        }

    }

    if (finalText.trim().length < 100) {

        finalText = await page.locator("body").innerText();

    }

    return cleanText(finalText);

}

module.exports = extractContent;