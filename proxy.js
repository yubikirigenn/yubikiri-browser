const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

// 全リクエスト共通プロキシ
router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    // バイナリも含めて取得
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      // HTML の場合
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // 相対パス補正
      if ($("head base").length === 0) {
        $("head").prepend(`<base href="${targetUrl}">`);
      }

      // 画像をプロキシ経由
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      // CSS
      $("link[rel='stylesheet']").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.startsWith("http")) {
          $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
        }
      });

      // JS
      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src && src.startsWith("http")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });

      // フォント等も CSS 内にある場合、URLを書き換え可能（高度）
      $("style").each((_, el) => {
        const styleContent = $(el).html();
        if (styleContent.includes("url(")) {
          const newStyle = styleContent.replace(/url\((.*?)\)/g, (match, p1) => {
            let url = p1.replace(/['"]/g, "").trim();
            if (!url.startsWith("data:") && url.startsWith("http")) {
              return `url(/proxy?url=${encodeURIComponent(url)})`;
            }
            return match;
          });
          $(el).html(newStyle);
        }
      });

      res.set("Content-Type", "text/html");
      res.send($.html());

    } else {
      // HTML以外のリソース
      res.set("Content-Type", contentType);
      res.send(response.data);
    }

  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
