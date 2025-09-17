import express from "express";
import axios from "axios";
import compression from "compression";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom"; // HTML操作用

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(compression());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs"); // EJS 使う場合

// トップページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシ＋note整形
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

    // note記事なら本文部分だけ抽出
    let html = response.data;
    if (targetUrl.includes("note.com")) {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const article = document.querySelector("article"); // noteの記事本文
      if (article) {
        html = `<html><head><meta charset="UTF-8"><title>Note Article</title></head><body>${article.outerHTML}</body></html>`;
      }
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
