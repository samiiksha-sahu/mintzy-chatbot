function cleanText(text) {

    if (!text) return "";

    // Remove multiple blank lines
    text = text.replace(/\n{2,}/g, "\n");

    // Remove multiple spaces
    text = text.replace(/[ \t]{2,}/g, " ");

    // Remove strange unicode characters
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");

    // Split into lines
    let lines = text
        .split("\n")
        .map(line => line.trim());

    // Words we don't want
    const blocked = [

        "login",
        "sign in",
        "dashboard",
        "cookie",
        "privacy",
        "terms",
        "copyright",
        "follow us",
        "facebook",
        "instagram",
        "linkedin",
        "twitter",
        "youtube",

        "book demo",

        "contact us",

        "home"

    ];

    lines = lines.filter(line => {

        if (line.length < 3)
            return false;

        const lower = line.toLowerCase();

        return !blocked.some(word =>
            lower.includes(word)
        );

    });

    // Remove duplicate lines
    lines = [...new Set(lines)];

    return lines.join("\n");

}

module.exports = cleanText;