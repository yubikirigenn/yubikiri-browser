import express from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));

// メインページ
app.get("/", (req, res) => {
  res.sendFile(path.resolve("views/index.html"));
});

// プロキシ
app.get("/proxy", (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("Not found: url parameter is missing");

  fetchUrl(url, res);
});

// URLをフェッチする関数（制限回避用ヘッダを付与）
function fetchUrl(targetUrl, res) {
  try {
    const parsedUrl = new URL(targetUrl);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        "Referer": parsedUrl.origin
      },
      timeout: 10000
    };

    lib.get(parsedUrl, options, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        const redirectUrl = new URL(proxyRes.headers.location, parsedUrl);
        return fetchUrl(redirectUrl.href, res);
      }

      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on("error", (e) => {
      res.status(500).send("Error fetching the URL");
    });
  } catch (err) {
    res.status(400).send("Invalid URL");
  }
}

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
