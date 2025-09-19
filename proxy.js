const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

function rewriteUrl(originalUrl, baseUrl) {
  try {
    if (!originalUrl) return originalUrl;
    // 絶対URLに変換
    const absolute = new URL(originalUrl, baseUrl).toString();
    return `/proxy?url=${encodeURIComponent(absolute)}`;
  } catch (e) {
    return originalUrl;
  }
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  try {
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": targetUrl,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // 画像・リンク・スクリプトを書き換え
      $("img").each((_, el) => {
        $(el).attr("src", rewriteUrl($(el).attr("src"), targetUrl));
      });

      $("link").each((_, el) => {
        $(el).attr("href", rewriteUrl($(el).attr("href"), targetUrl));
      });

      $("script").each((_, el) => {
        $(el).attr("src", rewriteUrl($(el).attr("src"), targetUrl));
      });

      // CSS 内の url() も書き換え
      $("style, link[rel=stylesheet]").each((_, el) => {
        let cssContent = $(el).html() || "";
        cssContent = cssContent.replace(/url\(([^)]+)\)/g, (match, p1) => {
          const cleaned = p1.replace(/['"]/g, "");
          return `url(${rewriteUrl(cleaned, targetUrl)})`;
        });
        $(el).html(cssContent);
      });

      // XHR/Fetch 書き換え (簡易)
      $("script").each((_, el) => {
        let jsContent = $(el).html() || "";
        jsContent = jsContent.replace(/fetch\((['"`][^'"`]+['"`])/g, (match, p1) => {
          const urlInside = p1.slice(1, -1); // remove quotes
          return `fetch('${rewriteUrl(urlInside, targetUrl)}'`;
        });
        $(el).html(jsContent);
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
