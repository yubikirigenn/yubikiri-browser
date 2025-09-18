import express from "express";
import https from "https";
import http from "http";
import { URL } from "url";

const app = express();
const PORT = process.env.PORT || 10000;

// 静的ファイル (views, public)
app.use(express.static("public"));
app.use(express.static("views"));

// プロキシルート
app.get("/proxy", (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("Error: url parameter is missing");
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const proxyReq = client.get(targetUrl, (proxyRes) => {
      let body = [];

      // レスポンスヘッダーをコピー
      Object.keys(proxyRes.headers).forEach((key) => {
        res.setHeader(key, proxyRes.headers[key]);
      });

      proxyRes.on("data", (chunk) => body.push(chunk));
      proxyRes.on("end", () => {
        body = Buffer.concat(body);
        const contentType = proxyRes.headers["content-type"] || "";

        // HTML の場合は書き換え
        if (contentType.includes("text/html")) {
          let text = body.toString("utf8");

          // href/src をすべて /proxy 経由に書き換える
          text = text.replace(/(href|src)=["'](.*?)["']/g, (match, attr, url) => {
            // 絶対URL
            if (url.startsWith("http")) {
              return `${attr}="/proxy?url=${encodeURIComponent(url)}"`;
            }
            // 相対URL
            else if (url.startsWith("/")) {
              const newUrl = parsedUrl.origin + url;
              return `${attr}="/proxy?url=${encodeURIComponent(newUrl)}"`;
            }
            // その他（例: ./script.js）
            else {
              const newUrl = new URL(url, parsedUrl.href).href;
              return `${attr}="/proxy?url=${encodeURIComponent(newUrl)}"`;
            }
          });

          res.setHeader("content-type", "text/html; charset=utf-8");
          res.send(text);
        } else {
          // HTML 以外はそのまま返す
          res.send(body);
        }
      });
    });

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err);
      res.status(500).send("Proxy error");
    });
  } catch (e) {
    console.error("Invalid URL:", e);
    res.status(400).send("Invalid URL");
  }
});

// ルートページ
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/views/index.html");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
