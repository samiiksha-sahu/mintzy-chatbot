const { autoScroll, extractInternalLinks } = require("./helpers");
const { BASE_URL, BLOCKED_PATHS } = require("./config");

async function discoverPages(browser) {

    console.log("Discovering pages...\n");

    const page = await browser.newPage();

    await page.goto(BASE_URL, {
        waitUntil: "load",
        timeout: 60000
    });

    await page.waitForTimeout(3000);

    await autoScroll(page);

    const links = await extractInternalLinks(page, BASE_URL);

    await page.close();

    const unique = [...new Set(links)];

    return unique.filter(link =>
        !BLOCKED_PATHS.some(x =>
            link.toLowerCase().includes(x)
        )
    );
}

module.exports = discoverPages;