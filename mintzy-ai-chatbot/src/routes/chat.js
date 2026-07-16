const fs = require("fs");
const path = require("path");
const search = require("../retriever/search");
const askLLM = require("../llm/sarvam");

const MAX_HISTORY_TURNS = 5;
const MAX_CONTEXT_CHARS = 12000;
const FOLLOWUP_PATTERN = /\b(it|its|it's|that|this|these|those|they|them|same|above|previous)\b/i;
const GREETING_PREFIX_PATTERN = /^(hi+|hello|hey|heya|yo|good morning|good afternoon|good evening)[\s,!.]*/i;
const TRIVIAL_REMAINDER_PATTERN = /^(how are you\??|how'?s it going\??|what'?s up\??|there)?$/i;
const IDENTITY_PATTERN = /\b(what('| i)?s your name|who are you|what are you called)\b/i;


const GREETING_RESPONSE = "Hey there! 👋\n\nI'm Mynt.\n\nAsk me about Plugin, Seed, pricing, or anything else Mintzy!";
const IDENTITY_RESPONSE = "I'm Mynt, Mintzy's AI Assistant! I'm here to help with anything about Plugin, Seed, pricing, API, or the platform. What can I help you with?";
const FAREWELL_PATTERN = /\b(bye|goodbye|see you|see ya|talk (to you )?(later|soon)|thanks?,?\s*bye|nice (talking|chatting) (to|with) you|that'?s all|gtg|got to go)\b/i;
const FAREWELL_RESPONSE = "It was great chatting with you! 👋 Come back anytime you have questions about Mintzy.";

const DATA_DIR = path.join(__dirname, "../../data");

const CANNED_MARKERS = [
  "I'm not sure what you're asking",
  "Nice try!",
  "I found information related to your question",
];

const OFF_TOPIC_RESPONSE = `😄 Wish i would know! I'd probably get benched if I started answering these type of questions.

I'm Mintzy's AI Assistant, so I can only help with questions related to Mintzy's products, platform, documentation, APIs, pricing, integrations, and services.

Try asking me something like:

- What is Mintzy?
- Explain Seed.
- What does Plugin do?
- What pricing plans are available?
- How can I contact Mintzy?`;

const KNOWN_TOPICS = {
  plugin: "plugin.txt",
  seed: "seed.txt",
  backtester: "backtest.txt",
  backtest: "backtest.txt",
  blog: "blog.txt",
  documentation: "apiDocs.txt",
  "api docs": "apiDocs.txt",
  "api key": "apiDocs.txt",
  sdk: "apiDocs.txt",
  install: "apiDocs.txt",
  installation: "apiDocs.txt",
  "access token": "apiDocs.txt",
  ticker: "apiDocs.txt",
  founder: "about.txt",
  founders: "about.txt",
  mission: "about.txt",
  vision: "about.txt",
  "who built": "about.txt",
  "why we built": "about.txt",
  "about mintzy": "about.txt",
  "about us": "about.txt",
  team: "about.txt",
  career: "careers.txt",
  careers: "careers.txt",
  hiring: "careers.txt",
  "job opening": "careers.txt",
  "open role": "careers.txt",
  "open roles": "careers.txt",
  "join mintzy": "careers.txt",
  "work at mintzy": "careers.txt",
};

const BLOG_TITLES = [
  "trade engine",
  "trading operator",
  "non-performing loans",
  "npl",
  "fortune awaits",
  "imbalanced financial datasets",
  "ml algorithms",
];

function isCannedAnswer(answer) {
  if (!answer) return false;
  return CANNED_MARKERS.some((marker) => answer.includes(marker));
}

function isFollowUp(question) {
  return FOLLOWUP_PATTERN.test(question);
}

function extractTopic(question) {
  const match = question.match(/what\s+(?:is|are|does)\s+(.+?)\??$/i);
  return match ? match[1].trim() : question;
}

function buildRetrievalQuery(question, recentHistory) {
  const lastTurn = recentHistory[recentHistory.length - 1];
  if (lastTurn && isFollowUp(question)) {
    const topic = extractTopic(lastTurn.question);
    return `${topic} ${question}`;
  }
  return question;
}

function matchTopic(text) {
  const lower = text.toLowerCase();
  if (BLOG_TITLES.some((title) => lower.includes(title))) return "blog.txt";

  for (const [topic, file] of Object.entries(KNOWN_TOPICS)) {
    if (lower.includes(topic)) return file;
  }
  return null;
}

function inferSourceFile(question, recentHistory) {
  const currentMatch = matchTopic(question);
  if (currentMatch) return currentMatch;

  const lastTurn = recentHistory[recentHistory.length - 1];
  if (lastTurn && isFollowUp(question)) {
    return matchTopic(lastTurn.question);
  }

  return null;
}

function loadFullFile(filename) {
  try {
    return fs.readFileSync(path.join(DATA_DIR, filename), "utf8");
  } catch {
    return null;
  }
}

function dedupeHistory(history) {
  const seen = new Set();
  const result = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const key = history[i].question.trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.unshift(history[i]);
    }
  }
  return result;
}

function stripGreetingOpener(text) {
  if (!text) return text;
  return text.replace(/^(hey!?|hi!?)\s*happy to help\.?\s*(👋|👋🏻)?\s*\n*/i, "").trim();
}

async function chat(question, history = []) {
  let workingQuestion = question.trim();
  let greeted = false;

  // If the message starts with a greeting, check what's left after it.
  // Pure/trivial remainder ("hi", "hi how are you") -> just the greeting reply.
  // Real content after it ("hi what are your prices") -> acknowledge, then
  // keep processing the remainder as the actual question.
  const greetingMatch = workingQuestion.match(GREETING_PREFIX_PATTERN);
  if (greetingMatch) {
    const remainder = workingQuestion.slice(greetingMatch[0].length).trim();
    if (TRIVIAL_REMAINDER_PATTERN.test(remainder)) {
      return GREETING_RESPONSE;
    }
    workingQuestion = remainder;
    greeted = true;
  }

  if (IDENTITY_PATTERN.test(workingQuestion)) {
    return IDENTITY_RESPONSE;
  }

  if (FAREWELL_PATTERN.test(workingQuestion)) {
    return FAREWELL_RESPONSE;
  }

  const recentHistory = history.slice(-MAX_HISTORY_TURNS);
  const inferredSource = inferSourceFile(workingQuestion, recentHistory);

  let context;
  let historyForModel = recentHistory;

  if (inferredSource) {
    // Known topic (e.g. "plugin") — search WITHIN that file instead of
    // dumping the whole thing, so questions like "what is plugin" only
    // pull the relevant section instead of Overview + pricing + everything.
    const retrievalQuery = buildRetrievalQuery(workingQuestion, recentHistory);
    const docs = await search(retrievalQuery, 4, 0.20, inferredSource);
    console.log(`--- TOPIC-FILTERED SEARCH: ${inferredSource} ---`);
    docs.forEach((d) => console.log(`[${d.source} #${d.chunk}] score=${d.score.toFixed(3)}`));
    console.log("------------------------------------------");

    if (docs.length > 0) {
      context = docs.map((doc) => doc.text).join("\n\n").slice(0, MAX_CONTEXT_CHARS);
    } else {
      // Nothing scored well enough within the file — fall back to the
      // full file rather than returning an empty-context answer.
      const fullText = loadFullFile(inferredSource);
      context = fullText ? fullText.slice(0, MAX_CONTEXT_CHARS) : "";
      console.log(`--- FALLBACK TO FULL FILE: ${inferredSource} (${context.length} chars) ---`);
    }

    historyForModel = recentHistory.filter((turn) => matchTopic(turn.question) === inferredSource);
  } else {
    const retrievalQuery = buildRetrievalQuery(workingQuestion, recentHistory);
    const docs = await search(retrievalQuery, 3, 0.30);
    console.log("--- RETRIEVED CHUNKS ---");
    docs.forEach((d) => console.log(`[${d.source} #${d.chunk}] score=${d.score.toFixed(3)}`));
    console.log("------------------------");

    if (docs.length === 0) {
      console.log("--- NO RELEVANT CONTEXT FOUND — treating as off-topic, skipping LLM call ---");
      return OFF_TOPIC_RESPONSE;
    }

    context = docs.map((doc) => doc.text).join("\n\n").slice(0, MAX_CONTEXT_CHARS);
  }

  const cleanHistory = dedupeHistory(historyForModel.filter((turn) => !isCannedAnswer(turn.answer)));

  const rawAnswer = await askLLM(workingQuestion, context, cleanHistory);
  const answer = stripGreetingOpener(rawAnswer);

  return greeted ? `Hey! Happy to help. 👋\n\n${answer}` : answer;
}

module.exports = chat;