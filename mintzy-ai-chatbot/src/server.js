// New file: save this as src/server.js in your mintzy-ai-chatbot project.
// This is the missing piece — it's the first place your project actually
// listens on an HTTP port. Everything else (search, askLLM, chat) is
// untouched; this just wraps your existing chat() function in a route.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const chat = require("./routes/chat"); // your existing chat(question, history) function

const app = express();
app.use(express.json());
app.use(cors());

/**
 * POST /api/chat
 * Called by the FastAPI backend.
 * body: { message: string, history: [{ user, bot }, ...] }
 * returns: { reply: string }
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message is required" });
    }

    // FastAPI sends history as {user, bot} pairs — your chat() function
    // expects {question, answer} pairs, so convert here.
    const mintzyHistory = history.map((turn) => ({
      question: turn.user,
      answer: turn.bot,
    }));

    const reply = await chat(message, mintzyHistory);
    res.json({ reply });
  } catch (err) {
    console.error("chat route error:", err);
    res.status(500).json({ reply: "Something went wrong generating a response." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Mintzy chat server running on http://localhost:${PORT}`);
});