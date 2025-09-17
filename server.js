// server.js
import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ミドルウェア
app.use(express.urlencoded({ extended: true })); // POSTフォーム用
app.use(express.json());
app.use(cookieParser());
app.use(compression());
app.use(express.static(path.join(__dirname, "public"))); // /public 配下の静的ファイル配信

// HTML を返すフォームページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/index.html"));
});

// プロキシ処理関数
const proxyHandler = async (req, res) => {
  const targetUrl = req.query.url || req.body.url;
  if (!targetUrl) return res.status(400).send("URLを入力してください");

  try {
    const response = await fetch(targetUrl, { redirect: "follow" });
    let contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
      let text = await response.text();
      // 制限回避やURL書き換えなどの簡易処理
      text = text.replace(/https?:\/\/[^ "]+/g, (match) => `/proxy?url=${encodeURIComponent(match)}`);
      res.send(text);
    } else {
      // HTML 以外はそのまま
      const buffer = await response.arrayBuffer();
      res.set("Content-Type", contentType || "application/octet-stream");
      res.send(Buffer.from(buffer));
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("プロキシでエラーが発生しました");
  }
};

// GET /proxy と POST /proxy の両対応
app.get("/proxy", proxyHandler);
app.post("/proxy", proxyHandler);

app.listen(PORT, () => {
  console.log(`yubikiri-browser running on port ${PORT}`);
});
