const express = require("express");
const fetch = require("node-fetch");
const { CookieJar } = require("tough-cookie");

const router = express.Router();
const jar = new CookieJar();

router.get("/", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send("❌ URL is required");
  }

  try {
    // リクエストヘッダー調整（制限回避ポイント）
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      "Referer": targetUrl
    };

    const response = await fetch(targetUrl, { headers });

    // Cookie保持
    const setCookie = response.headers.raw()["set-cookie"];
    if (setCookie) {
      setCookie.forEach((c) => jar.setCookieSync(c, targetUrl));
    }

    // Content-Type確認
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      let body = await response.text();

      // 相対リンクやリソースをプロキシ化
      body = body.replace(
        /((src|href)=["'])(?!https?:\/\/)([^"']+)/gi,
        (match, p1, p2, url) => {
          const newUrl = new URL(url, targetUrl).href;
          return `${p1}/proxy?url=${encodeURIComponent(newUrl)}`;
        }
      );

      // CSS 内 url(...) を変換
      body = body.replace(
        /url\(["']?(?!https?:\/\/)([^"')]+)["']?\)/gi,
        (match, url) => {
          const newUrl = new URL(url, targetUrl).href;
          return `url(/proxy?url=${encodeURIComponent(newUrl)})`;
        }
      );

      res.set("content-type", "text/html; charset=utf-8");
      res.send(body);
    } else {
      // HTML以外はそのまま転送
      res.set("content-type", contentType);
      const buf = await response.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (err) {
    console.error("proxy error:", err);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
