const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    const response = await axios.get(targetUrl, {
      responseType: "text", // 文字列として取得
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";
    if (contentType.includes("text/html")) {
      const $ = cheerio.load(response.data);

      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl).href)}`);
        }
      });

      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl).href)}`);
        }
      });

      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl).href)}`);
        }
      });

      $("iframe").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl).href)}`);
        }
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
