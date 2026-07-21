const fs = require("fs");
const path = require("path");
const { pipeline } = require("@huggingface/transformers");

let embedder = null;

async function loadModel() {
  if (!embedder) {
    console.log("Loading embedding model...");
    embedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("Embedding model loaded.");
  }
}

const database = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "../../data/embeddings.json"),
    "utf8"
  )
);

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function expandPriceNeighbors(results, allDocs) {
  const expanded = [...results];
  const seen = new Set(results.map((r) => `${r.source}#${r.chunk}`));
  const queue = [];

  for (const r of results) {
    if (r.text.includes("₹")) {
      queue.push(r);
    } else {
      // If the retrieved chunk doesn't have "₹", pull in its immediate neighbors
      // if they contain a price symbol.
      const immediateNeighbors = allDocs.filter(
        (d) =>
          d.source === r.source &&
          Math.abs(d.chunk - r.chunk) === 1 &&
          d.text.includes("₹") &&
          !seen.has(`${d.source}#${d.chunk}`)
      );
      for (const n of immediateNeighbors) {
        seen.add(`${n.source}#${n.chunk}`);
        const nWithScore = { ...n, score: r.score };
        expanded.push(nWithScore);
        queue.push(nWithScore);
      }
    }
  }

  while (queue.length > 0) {
    const r = queue.shift();

    const neighbors = allDocs.filter(
      (d) =>
        d.source === r.source &&
        Math.abs(d.chunk - r.chunk) === 1 &&
        d.text.includes("₹") &&
        !seen.has(`${d.source}#${d.chunk}`)
    );

    for (const n of neighbors) {
      seen.add(`${n.source}#${n.chunk}`);
      const nWithScore = { ...n, score: r.score };
      expanded.push(nWithScore);
      queue.push(nWithScore);
    }
  }

  return expanded;
}

/**
 * @param {string} query
 * @param {number} topK
 * @param {number} minScore
 * @param {string|null} sourceFilter - restrict candidates to one source file,
 *   e.g. "plugin.txt". Used by chat.js for known-topic questions so the whole
 *   file isn't dumped — only the semantically relevant section(s) are.
 */
async function search(query, topK = 5, minScore = 0.10, sourceFilter = null) {
  await loadModel();

  const embedding = await embedder(query, {
    pooling: "mean",
    normalize: true,
  });

  const vector = Array.from(embedding.data);

  const candidates = sourceFilter
    ? database.filter((doc) => doc.source === sourceFilter)
    : database;

  const scored = candidates.map((doc) => ({
    ...doc,
    score: cosineSimilarity(vector, doc.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  let results = scored.filter((doc) => doc.score >= minScore).slice(0, topK);

  if (/price|pricing|cost|₹|plan|subscription|tier|package/i.test(query)) {
    results = expandPriceNeighbors(results, candidates);
  }

  // Force include Chunk 11 for founder/team/executive queries in about.txt
  if (sourceFilter === "about.txt" && /founder|ceo|cto|team/i.test(query)) {
    const chunk11 = candidates.find((d) => d.chunk === 11);
    if (chunk11 && !results.some((r) => r.chunk === 11)) {
      results.push({ ...chunk11, score: 0.99 });
    }
  }

  return results;
}

function getPriceChunksForSource(source) {
  return database.filter((d) => d.source === source && d.text.includes("₹"));
}

module.exports = search;
module.exports.getPriceChunksForSource = getPriceChunksForSource;