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
    // axiosで取得
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      // HTMLの場合 → cheerioでリンク書き換え
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

      // CSS 内の url(...) を書き換え（フォント・画像対応）
      $("style").each((_, el) => {
        let styleContent = $(el).html();
        styleContent = styleContent.replace(/url\(([^)]+)\)/g, (match, url) => {
          const cleanUrl = url.replace(/['"]/g, "");
          return `url(/proxy?url=${encodeURIComponent(new URL(cleanUrl, targetUrl))})`;
        });
        $(el).html(styleContent);
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      // HTML以外（CSS, JS, 画像, フォントなど）はそのまま返す
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
