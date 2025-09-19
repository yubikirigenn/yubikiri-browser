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
    console.log("=== Proxy Request Start ===");
    console.log("Target URL:", targetUrl);

    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",   // バイナリも扱えるように
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en;q=0.9",
      },
      maxRedirects: 5, // Amazon がリダイレクトすることが多いので
      validateStatus: () => true, // axios が自動で throw しないように
    });

    console.log("Response status:", response.status);

    // Amazon など 403 を返す場合でもそのままクライアントに返す
    res.set(response.headers);
    res.status(response.status).send(response.data);

    console.log("=== Proxy Request End ===");
  } catch (err) {
    console.error("=== Proxy Error Start ===");
    console.error("Target URL:", targetUrl);
    console.error("Error details:", err.message);
    if (err.response) {
      console.error("Upstream status:", err.response.status);
      console.error("Upstream headers:", err.response.headers);
    }
    console.error(err.stack);
    console.error("=== Proxy Error End ===");

    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
