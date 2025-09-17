import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import cookieParser from "cookie-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

// ミドルウェア
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));

// ルート → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// プロキシ
app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("URLが必要です");

  let decodedUrl;
  try { decodedUrl = decodeURIComponent(targetUrl); } 
  catch { decodedUrl = targetUrl; }

  try {
    const response = await fetch(decodedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    });

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let body = await response.text();

      // HTML内のリンク・画像・iframe・videoをプロキシ経由に置換
      const urlRegex = /(href|src|data-src|action)=["'](http[s]?:\/\/[^"']+)["']/g;
      body = body.replace(urlRegex, (match, attr, url) => {
        return `${attr}="/proxy?url=${encodeURIComponent(url)}"`;
      });

      // iframe動画のサイズを制御して崩れを最小化
      body = body.replace(/<iframe([^>]+)><\/iframe>/g, (match, attr) => {
        if (!/width/.test(attr)) attr += ' width="100%"';
        if (!/height/.test(attr)) attr += ' height="500"';
        return `<iframe${attr}></iframe>`;
      });

      res.set("Content-Type", "text/html");
      res.send(body);

    } else if (contentType.includes("application/javascript")) {
      res.set("Content-Type", "application/javascript");
      res.send(await response.text());

    } else if (contentType.includes("text/css")) {
      res.set("Content-Type", "text/css");
      res.send(await response.text());

    } else {
      // 画像・動画・PDFなど
      const buffer = await response.arrayBuffer();
      res.set("Content-Type", contentType);
      res.send(Buffer.from(buffer));
    }

  } catch (err) {
    res.status(500).send("プロキシ中にエラーが発生しました: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`yubikiri-browser enhanced running on port ${PORT}`);
});
