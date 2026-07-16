const path = require("path");

module.exports = {
  BASE_URL: "https://www.mintzy.in",

  OUTPUT_DIR: path.join(__dirname, "../../data"),

  BLOCKED_PATHS: [
    "dashboard",
    "login",
    "signin",
    "privacy",
    "terms",
    "cookie",
    "security",
    "community",
    "careers"
  ],

  CONTENT_SELECTORS: [
    "main",
    "article",
    "[role='main']",
    "section"
  ]
};