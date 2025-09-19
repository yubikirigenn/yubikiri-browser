// proxy.js
const express = require("express");
const fetch = require("node-fetch");

const router = express.Router();

router.get("/", async (req, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).send("Missing url parameter");
  }

  console.log("=== Proxy Request Start ===");
  console.log("Target URL:", target);

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
    });

    console.log("Response status:", response.status);

    const text = await response.text();

    res.status(response.status);
    res.send(text);

    console.log("=== Proxy Request End ===");
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
