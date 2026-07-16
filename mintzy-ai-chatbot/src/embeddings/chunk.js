const fs = require("fs");
const path = require("path");

const DATA_DIR = "./data";
const OUTPUT_FILE = "./src/embeddings/chunks.json";

function isHeadingLine(line, nextLine) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // A line ending in . or ! is a finished statement — always content, never a heading.
  if (/[.!]$/.test(trimmed)) return false;

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 12) return false;

  // Lines ending in ? (like FAQ questions) CAN be headings, as long as
  // what follows is a real answer sentence.
  const next = (nextLine || "").trim();
  const nextIsSentence = /[.!?]$/.test(next) && next.split(/\s+/).length > 4;

  return nextIsSentence;
}

function chunkText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const chunks = [];
  let currentHeading = null;
  let currentContent = [];

  function flush() {
    const contentText = currentContent.join(" ").trim();
    if (currentHeading && contentText) {
      chunks.push(`${currentHeading}\n${contentText}`);
    }
    currentContent = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    if (isHeadingLine(line, nextLine)) {
      flush();
      currentHeading = line;
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return chunks.filter((c) => c.length > 40);
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.log("No data folder found.");
    return;
  }

  const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith(".txt"));
  const allChunks = [];
  let id = 1;

  for (const file of files) {
    const filepath = path.join(DATA_DIR, file);
    const text = fs.readFileSync(filepath, "utf8");
    const chunks = chunkText(text);
    console.log(`${file} -> ${chunks.length} chunks`);

    chunks.forEach((chunk, index) => {
      allChunks.push({
        id: id++,
        source: file,
        chunk: index + 1,
        text: chunk,
      });
    });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2));

  console.log("\n===============================");
  console.log(`Total Chunks : ${allChunks.length}`);
  console.log(`Saved File   : ${OUTPUT_FILE}`);
  console.log("===============================\n");
}

main();