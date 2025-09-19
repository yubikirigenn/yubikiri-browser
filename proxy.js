const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

// -----------------------------
// トップページとプロキシ処理
// -----------------------------
router.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  // -----------------------------
  // トップページ表示
  // -----------------------------
  if (!targetUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Yubikiri Proxy</title>
        <style>
          body { margin: 0; font-family: sans-serif; text-align: center; margin-top: 100px; }
          h1 { font-size: 64px; margin-bottom: 40px; }
          input { width: 400px; padding: 12px; font-size: 18px; }
          button { padding: 12px 20px; font-size: 18px; }
        </style>
      </head>
      <body>
        <h1>Yubikiri Proxy</h1>
        <form method="get">
          <input type="text" name="url" placeholder="Enter URL" />
          <button type="submit">GO</button>
        </form>
      </body>
      </html>
    `);
  }

  // -----------------------------
  // プロキシ処理
  // -----------------------------
  try {
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // img, link, script タグを書き換え
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
        }
      });

      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      // HTML以外のリソースはそのまま返す
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
