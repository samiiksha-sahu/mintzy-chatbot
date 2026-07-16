const fs = require("fs");

// Smoothly scroll the page
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 500;

            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
        });
    });
}

// Expand accordions/buttons if present
async function clickExpandableElements(page) {

    const selectors = [
        "button",
        "[role='button']",
        "[aria-expanded='false']",
        ".accordion",
        ".collapse"
    ];

    for (const selector of selectors) {

        const elements = page.locator(selector);

        const count = await elements.count();

        for (let i = 0; i < count; i++) {
            try {
                await elements.nth(i).click({
                    timeout: 500
                });
            } catch {}
        }
    }
}

// Collect all internal Mintzy links
async function extractInternalLinks(page, baseUrl) {

    return await page.evaluate((baseUrl) => {

        const links = [];

        document.querySelectorAll("a[href]").forEach(a => {

            const href = a.href;

            if (href.startsWith(baseUrl)) {
                links.push(href.split("#")[0]);
            }

        });

        return links;

    }, baseUrl);

}

// Clean scraped text
function cleanText(text) {

    return text
        .replace(/\r/g, "")
        .replace(/\t/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ ]{2,}/g, " ")
        .trim();

}

// Convert URL into filename
function urlToFilename(url) {

    const pathname = new URL(url).pathname;

    if (pathname === "/")
        return "home.txt";

    return pathname
        .replace(/\//g, "_")
        .replace(/^_/, "")
        + ".txt";

}

// Save text
function saveText(outputDir, filename, text) {

    fs.writeFileSync(
        `${outputDir}/${filename}`,
        text,
        "utf8"
    );

}

module.exports = {
    autoScroll,
    clickExpandableElements,
    extractInternalLinks,
    cleanText,
    urlToFilename,
    saveText
};