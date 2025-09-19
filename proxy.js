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
    // HTML やリソースを取得
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer", // バイナリも受け取れるようにする
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    // ------------------------------
    // HTML の場合
    // ------------------------------
    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // <img>
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      // <link>
      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
        }
      });

      // <script>
      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      // <style> 内の url(...)
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
    }

    // ------------------------------
    // CSS の場合（外部 CSS）
    // ------------------------------
    else if (contentType.includes("text/css")) {
      let css = response.data.toString("utf-8");

      // CSS 内の url(...) を全部書き換え
      css = css.replace(/url\(([^)]+)\)/g, (match, url) => {
        const cleanUrl = url.replace(/['"]/g, "");
        return `url(/proxy?url=${encodeURIComponent(new URL(cleanUrl, targetUrl))})`;
      });

      res.set("Content-Type", "text/css");
      res.send(css);
    }

    // ------------------------------
    // それ以外（画像, フォント, JS など）
    // ------------------------------
    else {
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
