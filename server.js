import express from "express";
import * as cheerio from "cheerio";
import cloudscraper from "cloudscraper";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// サーバーサイドプロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ success: false, message: "URL パラメータが必要です" });
  }

  try {
    // cloudscraper で JS チャレンジや制限突破
    const html = await cloudscraper.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      followAllRedirects: true,
    });

    const $ = cheerio.load(html);

    // リンクやリソースを書き換え
    const rewriteAttr = (selector, attr) => {
      $(selector).each((_, el) => {
        const val = $(el).attr(attr);
        if (!val) return;
        try {
          const absUrl = new URL(val, targetUrl).href;
          $(el).attr(attr, `/proxy?url=${encodeURIComponent(absUrl)}`);
        } catch {}
      });
    };

    rewriteAttr("a", "href");
    rewriteAttr("link", "href");
    rewriteAttr("script", "src");
    rewriteAttr("img", "src");
    rewriteAttr("form", "action");

    res.setHeader("Content-Type", "text/html");
    res.send($.html());
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "コンテンツ取得エラー: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`yubikiri-proxy running at http://localhost:${PORT}`);
});
