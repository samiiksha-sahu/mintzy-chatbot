/**
 * Embeddable chat bubble widget.
 */
(function () {
  const CONFIG = Object.assign(
    {
      apiUrl: "http://localhost:8000",
      title: "Mynt",
      subtitle: "LIVE",
      greeting: "Hey there! 👋\nI'm Mynt.\nAsk me about Plugin, Seed, pricing, or anything else Mintzy!",
    },
    window.CW_CONFIG || {}
  );

  const SESSION_KEY = "cw_session_id";
  const TYPING_SPEED_MS = 12;

  // 🌟 Scroll-follow state, shared across the whole widget instance.
  // autoScroll = true means "the user is currently following the latest
  // content, so keep scrolling to reveal new text as it streams in".
  // It flips to false the moment the user scrolls away from the bottom of
  // the current content, and flips back to true once they scroll back down.
  let autoScroll = true;

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  }

  // --- scroll helpers -------------------------------------------------

  function isNearBottom(container, threshold = 40) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }

  // Plain "stick to bottom" scrolling: if the user is following along
  // (autoScroll true), jump straight to the bottom whenever content is
  // added or grows. If they've scrolled up to read earlier messages, this
  // does nothing until they scroll back down.
  function followContent(container) {
    if (!autoScroll) return;
    container.scrollTop = container.scrollHeight;
  }

  // Helper for generating the mini avatar in chat rows
  function createBotAvatar() {
    const avatar = el("div", { class: "cw-bot-avatar" });
    avatar.innerHTML = `
      <svg viewBox="0 0 100 100" fill="none" stroke="var(--cw-blue)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width: 65%; height: 65%;">
        <line x1="22" y1="45" x2="22" y2="18" />
        <circle cx="22" cy="15" r="4" />
        <line x1="78" y1="45" x2="78" y2="18" />
        <circle cx="78" cy="15" r="4" />
        <path d="M 16 48 C 4 48 4 68 16 68" />
        <path d="M 84 48 C 96 48 96 68 84 68" />
        <rect x="16" y="30" width="68" height="52" rx="24" />
        <rect x="26" y="42" width="48" height="30" rx="12" />
        <rect x="35" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
        <rect x="55" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
      </svg>
    `;
    return avatar;
  }

  function build() {
    const bubble = el("button", { id: "cw-bubble", "aria-label": "Open chat" },
      (() => {
        const div = el("div", { style: "width: 40px; height: 40px; display: flex; flex-shrink: 0;"});
        div.innerHTML = `
          <svg viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
            <line x1="22" y1="45" x2="22" y2="18" />
            <circle cx="22" cy="15" r="4" />
            <line x1="78" y1="45" x2="78" y2="18" />
            <circle cx="78" cy="15" r="4" />
            <path d="M 16 48 C 4 48 4 68 16 68" />
            <path d="M 84 48 C 96 48 96 68 84 68" />
            <rect x="16" y="30" width="68" height="52" rx="24" />
            <rect x="26" y="42" width="48" height="30" rx="12" />
            <rect x="35" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
            <rect x="55" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
          </svg>
        `;
        return div;
      })(),
      el("div", { class: "cw-tooltip" }, "👋 Hi, I'm Mynt,\nAsk me questions about Mintzy.")
    );

   const welcomeBlock = el("div", { id: "cw-panel-welcome" },
      (() => {
        const c = el("div", { class: "cw-panel-avatar" });
        c.innerHTML = `
          <svg viewBox="0 0 100 100" fill="none" stroke="var(--cw-blue)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;">
            <line x1="22" y1="45" x2="22" y2="18" />
            <circle cx="22" cy="15" r="4" />
            <line x1="78" y1="45" x2="78" y2="18" />
            <circle cx="78" cy="15" r="4" />
            <path d="M 16 48 C 4 48 4 68 16 68" />
            <path d="M 84 48 C 96 48 96 68 84 68" />
            <rect x="16" y="30" width="68" height="52" rx="24" />
            <rect x="26" y="42" width="48" height="30" rx="12" />
            <rect x="35" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
            <rect x="55" y="49" width="10" height="15" rx="2" fill="#4ADE80" stroke="none" />
          </svg>
        `;
        return c;
      })()
    );

    const messages = el("div", { id: "cw-messages" }, welcomeBlock);

    const panel = el(
      "div",
      { id: "cw-panel" },
      el(
        "div",
        { id: "cw-header" },
        el(
          "div",
          {},
          el("div", { class: "cw-title" }, CONFIG.title),
          el("div", { class: "cw-subtitle" }, CONFIG.subtitle)
        ),
        el("button", { id: "cw-close", "aria-label": "Close chat" }, "\u2715")
      ),
      messages,
      el(
        "div",
        { id: "cw-inputbar" },
        el("textarea", { id: "cw-input", rows: "1", placeholder: "Type a message\u2026" }),
        el(
          "button",
          { id: "cw-send", "aria-label": "Send" },
          (() => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 24 24");
            const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
            p.setAttribute("d", "M3 11l18-7-7 18-2.5-7L3 11z");
            p.setAttribute("stroke", "#fff");
            p.setAttribute("stroke-width", "1.8");
            p.setAttribute("stroke-linejoin", "round");
            p.setAttribute("fill", "none");
            svg.appendChild(p);
            return svg;
          })()
        )
      )
    );

    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    return { 
      bubble, 
      panel, 
      welcomeBlock,
      messages, 
      input: panel.querySelector("#cw-input"), 
      send: panel.querySelector("#cw-send"), 
      close: panel.querySelector("#cw-close") 
    };
  }

  // beforeNode: if provided, the new element is inserted before it
  // (e.g. before the scroll spacer) instead of appended at the very end.
  function addMessage(container, text, role, beforeNode) {
    if (role === "bot") {
      const row = el("div", { class: "cw-bot-row" });
      row.appendChild(createBotAvatar());
      
      const msg = el("div", { class: "cw-msg cw-bot" });
      if (window.marked) {
        msg.innerHTML = window.marked.parse(text);
      } else {
        msg.textContent = text;
      }
      row.appendChild(msg);
      container.insertBefore(row, beforeNode || null);
      followContent(container);
      return msg;
    } else {
      const msg = el("div", { class: `cw-msg cw-${role}` });
      msg.textContent = text;
      container.insertBefore(msg, beforeNode || null);
      followContent(container);
      return msg;
    }
  }

  function addTyping(container, beforeNode) {
    const row = el("div", { class: "cw-bot-row" });
    row.appendChild(createBotAvatar());

    const typing = el(
      "div",
      { class: "cw-msg cw-typing" },
      el("span", { class: "cw-dot" }),
      el("span", { class: "cw-dot" }),
      el("span", { class: "cw-dot" })
    );
    
    row.appendChild(typing);
    container.insertBefore(row, beforeNode || null);
    followContent(container);
    
    return row; 
  }

  function typeMessage(container, text, beforeNode) {
    const row = el("div", { class: "cw-bot-row" });
    row.appendChild(createBotAvatar());

    const msg = el("div", { class: "cw-msg cw-bot" });
    row.appendChild(msg);
    container.insertBefore(row, beforeNode || null);

    const words = text.split(/(\s+)/);
    let i = 0;

    return new Promise((resolve) => {
      function step() {
        i++;
        const partial = words.slice(0, i).join("");
        if (window.marked) {
          msg.innerHTML = window.marked.parse(partial);
        } else {
          msg.textContent = partial;
        }
        followContent(container);

        if (i < words.length) {
          setTimeout(step, TYPING_SPEED_MS);
        } else {
          resolve(msg);
        }
      }
      step();
    });
  }

  async function sendMessage(ui, text) {
    ui.welcomeBlock.classList.add("cw-hidden-header");

    const container = ui.messages;

    const userMsgEl = addMessage(container, text, "user");
    ui.input.value = "";
    ui.send.disabled = true;
    // Sending a message always means "follow along" from here.
    autoScroll = true;

    const typing = addTyping(container);

    try {
      const res = await fetch(`${CONFIG.apiUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: getSessionId(), message: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      typing.remove();
      await typeMessage(container, data.reply);
    } catch (err) {
      typing.remove();
      addMessage(container, "I couldn't reach the server just now. Please try again in a moment.", "bot");
      console.error("chat widget error:", err);
    } finally {
      ui.send.disabled = false;
    }
  }

  function init() {
    const ui = build();
    let opened = false;

    // 🌟 Tracks whether the user is still "following" the latest content.
    // If they scroll up away from the bottom, streaming stops auto-scrolling
    // until they scroll back down — so they can freely read earlier messages.
    ui.messages.addEventListener("scroll", () => {
      autoScroll = isNearBottom(ui.messages);
    });

    ui.bubble.addEventListener("click", () => {
      ui.panel.classList.add("cw-open");

      if (!opened) {
        addMessage(ui.messages, CONFIG.greeting, "bot");
        opened = true;
      }

      setTimeout(() => ui.input.focus(), 350);
    });

    ui.close.addEventListener("click", () => ui.panel.classList.remove("cw-open"));

    ui.send.addEventListener("click", () => {
      const text = ui.input.value.trim();
      if (text) sendMessage(ui, text);
    });
    
    ui.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = ui.input.value.trim();
        if (text) sendMessage(ui, text);
      }
    });
    
    ui.input.addEventListener("input", () => {
      ui.input.style.height = "auto";
      ui.input.style.height = Math.min(ui.input.scrollHeight, 90) + "px";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();