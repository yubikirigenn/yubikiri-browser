import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { JSDOM } from "jsdom";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ミドルウェア
app.use(compression());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// フロントページ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

// Proxyルート
app.get("/proxy", async (req, res) => {
  try {
    let targetUrl = req.query.url;

    if (!targetUrl) {
      return res.status(400).send("Missing URL parameter.");
    }

    // 入力がURLでなければDuckDuckGo検索にする
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(targetUrl)}`;
    }

    // fetchで取得
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("text/html")) {
      let text = await response.text();
      const dom = new JSDOM(text);

      // 相対リンクをproxy経由に書き換え
      dom.window.document.querySelectorAll("a").forEach((a) => {
        const href = a.getAttribute("href");
        if (href && !href.startsWith("http") && !href.startsWith("javascript")) {
          try {
            a.href = `/proxy?url=${new URL(href, targetUrl).href}`;
          } catch {}
        } else if (href && href.startsWith("http")) {
          a.href = `/proxy?url=${href}`;
        }
      });

      res.set("content-type", "text/html");
      res.send(dom.serialize());
    } else {
      // HTML以外（画像・CSS・JSなど）
      const buffer = Buffer.from(await response.arrayBuffer());
      if (contentType) res.set("content-type", contentType);
      res.send(buffer);
    }
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Proxy error.");
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
