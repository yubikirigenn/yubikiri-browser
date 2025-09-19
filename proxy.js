const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    // axios で外部ページを取得
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    // HTML の場合はリンク書き換え
    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // 画像
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${new URL(src, targetUrl)}`);
        }
      });

      // CSS
      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          $(el).attr("href", `/proxy?url=${new URL(href, targetUrl)}`);
        }
      });

      // JS
      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${new URL(src, targetUrl)}`);
        }
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      // HTML 以外はそのまま返す
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (error) {
    console.error("Proxy error:", error.message);
    res.status(500).send("Proxy error: " + error.message);
  }
});

module.exports = router;
