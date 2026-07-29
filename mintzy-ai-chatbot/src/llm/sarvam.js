const OpenAI = require("openai");
require("dotenv").config();

const client = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY,
  baseURL: "https://api.sarvam.ai/v1",
});

const SUPPORT_FOOTER = `\n\n---\nNeed More Help?\n\n📧 [support@mintzy.in](mailto:support@mintzy.in)\n\nIf you need more detailed or personalized assistance, the Mintzy team will be happy to help.`;

const CASE_1 = `I found information related to your question in the Mintzy documentation, but there isn't enough detail available to provide a complete answer.

For more information, please contact the Mintzy team.` + SUPPORT_FOOTER;

const CASE_2 = `😄 Wish i would know! I'd probably get benched if I started answering these type of questions.

I'm Mintzy's AI Assistant, so I can only help with questions related to Mintzy's products, platform, documentation, APIs, pricing, integrations, and services.`;

const CASE_3 = `I'm not sure what you're asking.

Could you rephrase your question or ask something related to Mintzy?`;

function stripFooter(text) {
  if (!text) return "";
  return text.split(/\n*---\n*Need More Help\?/i)[0].trim();
}

function buildSystemPrompt(context) {
  return `
You are Mynt, Mintzy's AI Assistant — warm, friendly, and easy to talk to.

Rules:
1. Answer the user's question directly using the CONTEXT below.
2. Keep your response brief. If the question is a simple, single-concept definition (e.g., "what is the Backtester" or "what is an SDK"), write it as a single cohesive paragraph of 2 to 3 sentences maximum.
3. If the response requires explaining multiple features, products, or details (e.g., "what does Mintzy do", "what is the Plugin framework", or pricing plans), you MUST begin with a warm, conversational, friendly introductory sentence, and then follow it with short, clear bullet points. For pricing questions, you MUST list all three available plans: MINI, ALPHA, and BETA. Do not write a list without a friendly intro.
4. For step-by-step guides (e.g., "how to make the first prediction" or "how to install the SDK"), you MUST list each step as its own bullet point. Never write instructions as standard paragraphs. Always separate steps into a bulleted list.
5. Format all terminal commands, package names, and code inside inline markdown code blocks using backticks.
6. Use a natural, polite, friendly human tone — avoid sounding robotic or overly formal.
7. Do not include greetings/intro lines unless the user's message is itself a greeting.
8. No headings, no "Need More Help" footer, no LaTeX or math blocks.
9. Never combine multiple distinct features, plans, or services into a single paragraph. Use bullet points.

Formatting Examples:
- For short definitions (e.g., "what is backtester"):
"The Backtester is a tool that lets you validate your trading strategies before going live by running historical simulations on NSE data. You can test features like stop-loss rules and capital allocation in one workflow."

- For long overviews, features, or prices (e.g., "what does mintzy do"):
"Mintzy is an AI-powered market intelligence platform. Here is how we help you build quantitative strategies:
*   AI-powered market intelligence: Provides personalized strategies and automated trading tools through a broker-independent ecosystem.
*   Market forecasting API: Delivers scenario-based forecasting across equities, derivatives, and crypto assets.
*   Automated trading plugin: Unifies market data, decision-making, execution, and risk control in one system."

- For step-by-step instructions or tutorials (e.g., "how to make the first prediction"):
"Making your first prediction with Mintzy is straightforward! Follow these steps to get started:
*   First, initialize the Mintzy client by providing your access token:
    \`\`\`python
    client = Client(access_token="YOUR_ACCESS_TOKEN")
    \`\`\`
*   Next, call the \`get_prediction\` method to fetch the forecast data:
    \`\`\`python
    prediction = client.get_prediction(tickers=["RELIANCE"], timeframe="4 hours", parameters=["close"])
    \`\`\`"

If the message is just a greeting, reply briefly and warmly (1 sentence).
If CONTEXT is insufficient, reply exactly: "${CASE_1}"
If unrelated to Mintzy, reply exactly: "${CASE_2}"
If unclear, reply exactly: "${CASE_3}"

CONTEXT:
${context || ""}
`.trim();
}

function isBadOutput(text) {
  if (!text || typeof text !== "string") return true;

  const footerMatches = text.match(/Need More Help\?/g) || [];
  if (footerMatches.length > 1) return true;

  const h1Count = (text.match(/^# Overview$/gm) || []).length;
  const h2Count = (text.match(/^# Key Details$/gm) || []).length;
  const h3Count = (text.match(/^# Additional Information$/gm) || []).length;

  return h1Count > 1 || h2Count > 1 || h3Count > 1;
}

async function askLLM(question, context, history = []) {
  const systemPrompt = buildSystemPrompt(context);

  console.log("--- CONTEXT SENT TO LLM ---");
  console.log(context);
  console.log(`(length: ${context.length} chars)`);
  console.log("---------------------------");

  // Filter out fallback replies to prevent the conversational model from getting pattern-locked
  const cleanHistory = history.filter((turn) => {
    const ans = turn.answer || "";
    return !ans.includes("I found information related") &&
           !ans.includes("Wish i would know") &&
           !ans.includes("I'm not sure what you're asking");
  });

  const historyMessages = cleanHistory.flatMap((turn) => [
    { role: "user", content: turn.question },
    { role: "assistant", content: stripFooter(turn.answer) },
  ]);

  let response;
  try {
    response = await client.chat.completions.create({
      model: "sarvam-105b",
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
        { role: "user", content: question },
      ],
    });
  } catch (err) {
    console.error("--- SARVAM API ERROR ---", err.message);
    return CASE_1;
  }

  const message = response?.choices?.[0]?.message?.content?.trim();

  const finishReason = response?.choices?.[0]?.finish_reason;
  if (finishReason === "length" && !message) {
    console.log("--- TRUNCATED: model ran out of tokens before producing content ---");
  }

  console.log("--- RAW LLM OUTPUT ---");
  console.log(message);
  console.log("----------------------");

  if (isBadOutput(message)) {
    return CASE_3;
  }

  if (message.includes("I found information related")) return CASE_1;
  if (message.includes("Nice try!")) return CASE_2;
  if (message.includes("I'm not sure what you're asking")) return CASE_3;

  return stripFooter(message);
}

module.exports = askLLM;