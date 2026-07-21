const OpenAI = require("openai");
require("dotenv").config();

const client = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY,
  baseURL: "https://api.sarvam.ai/v1",
});

const CASE_1 = `I found information related to your question in the Mintzy documentation, but there isn't enough detail available to provide a complete answer.

For more information, please contact the Mintzy team.`;

const CASE_2 = `😄 Wish i would know! I'd probably get benched if I started answering these type of questions.

I'm Mintzy's AI Assistant, so I can only help with questions related to Mintzy's products, platform, documentation, APIs, pricing, integrations, and services.

Try asking me something like:

- What is Mintzy?
- Explain Seed.
- What does Plugin do?
- What pricing plans are available?
- How can I contact Mintzy?`;

const CASE_3 = `I'm not sure what you're asking.

Could you rephrase your question or ask something related to Mintzy?`;

const SUPPORT_FOOTER = `\n\n---\nNeed More Help?\n\n📧 [support@mintzy.in](mailto:support@mintzy.in)\n\nIf you need more detailed or personalized assistance, the Mintzy team will be happy to help.`;

function stripFooter(text) {
  if (!text) return "";
  return text.split(/\n*---\n*Need More Help\?/i)[0].trim();
}

function buildSystemPrompt(context) {
  return `
You are Mynt, Mintzy's AI Assistant. Do not think step by step. Write your final response immediately using CONTEXT.

Rules:
1. Answer only Mintzy-related questions, using ONLY the CONTEXT below. Use exact names/figures from CONTEXT.
2. Be concise, clear, and direct. Only answer the specific question asked. Do not volunteer extra information (such as pricing plans, founders, or additional details) unless explicitly asked.
3. Structure your response for chatbot readability:
   - Use short, clear sentences.
   - Use bullet points for lists or features.
   - Separate distinct ideas with line breaks (paragraphs) to keep it readable.
4. Do not output dry document headers or titles (such as "Overview", "Key Details", "Additional Information").
5. Never add a "Need More Help" footer. Never start your response with a greeting or filler phrases (like "Hey!", "Happy to help") — start directly with the content.

If the message is just a greeting, reply briefly.
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

  const historyMessages = history.flatMap((turn) => [
    { role: "user", content: turn.question },
    { role: "assistant", content: stripFooter(turn.answer) },
  ]);

  let response;
  try {
    response = await client.chat.completions.create({
      model: "sarvam-30b",
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0.5,
      max_tokens: 4096,
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

  return stripFooter(message) + SUPPORT_FOOTER;
}

module.exports = askLLM;