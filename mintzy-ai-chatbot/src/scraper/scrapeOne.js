const { chromium } = require("playwright");
const fs = require("fs");
const extractContent = require("./extract");

const OUTPUT_DIR = "./data";

const url = process.argv[2];
if (!url) {
  console.log("Usage: node src/scraper/scrapeOne.js <url>");
  process.exit(1);
}

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    const text = await extractContent(page);

    const filename =
      url.replace("https://www.mintzy.in/", "").replace(/\//g, "_") + ".txt";

    fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, text, "utf8");
    console.log("✓ Saved:", filename);
  } catch (err) {
    console.log("✗ Failed:", url);
    console.log(err.message);
  }

  await page.close();
  await browser.close();
})();