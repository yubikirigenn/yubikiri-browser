import express from "express";
import axios from "axios";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(compression());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Proxy + Note整形 + URL書き換え
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URLを指定してください。例: /proxy?url=https://note.com/");

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      },
      timeout: 10000
    });

    let html = response.data;
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Noteの記事部分を取得
    const article = document.querySelector("article");
    if (article) {
      // CSSやJSのパスを絶対URL化
      const base = new URL(targetUrl).origin;
      [...document.querySelectorAll("link[href], script[src], img[src], a[href]")].forEach(el => {
        if (el.href) el.href = `/proxy?url=${encodeURIComponent(el.href)}`;
        if (el.src) el.src = new URL(el.src, base).href;
      });
      html = `<html><head><meta charset="UTF-8"><title>Note Article</title></head><body>${article.outerHTML}</body></html>`;
    }

    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("URLの取得に失敗しました。JavaScriptが必要な場合があります。");
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
