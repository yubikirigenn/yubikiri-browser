// proxy.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    // HTMLを取得
    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      res.set("Content-Type", "text/html");
      res.send(response.data); // cheerio は使わずそのまま返す
    } else {
      res.status(400).send("Only HTML supported in this minimal proxy");
    }
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).send("Proxy error: " + error.message);
  }
});

module.exports = router;
