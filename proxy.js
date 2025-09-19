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
      $("img, script").each((_, el) => {
        const attr = el.name === "img" ? "src" : "src";
        const url = $(el).attr(attr);
        if (url && !url.startsWith("data:")) {
          $(el).attr(attr, `/proxy?url=${encodeURIComponent(new URL(url, targetUrl))}`);
        }
      });

      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
        }
      });

      // iframe の src も書き換え
      $("iframe").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      // style タグ内の url(...) も書き換え
      $("style").each((_, el) => {
        const css = $(el).html();
        if (css) {
          const newCss = css.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
            if (url.startsWith("data:")) return match;
            return `url(${quote}/proxy?url=${encodeURIComponent(new URL(url, targetUrl))}${quote})`;
          });
          $(el).html(newCss);
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
