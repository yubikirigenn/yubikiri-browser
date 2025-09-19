const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    // UTF-8文字列として取得
    const response = await axios.get(targetUrl, {
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      res.set("Content-Type", "text/html; charset=UTF-8");
      res.send(response.data); // 文字列として送信
    } else {
      res.status(400).send("Only HTML supported in this minimal proxy");
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
