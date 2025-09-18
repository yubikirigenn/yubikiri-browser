const http = require("http");
const https = require("https");
const express = require("express");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.set("views", "views");

// ホーム画面
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// プロキシ処理
app.get("/proxy", (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("URL is required");

  let targetUrl;
  try {
    targetUrl = new URL(target.startsWith("http") ? target : "http://" + target);
  } catch {
    return res.status(400).send("Invalid URL");
  }

  const client = targetUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    path: targetUrl.pathname + targetUrl.search,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; YubikiriBrowser/1.0)",
      "Accept": "*/*",
      "Accept-Language": "ja,en;q=0.9",
    },
  };

  const proxyReq = client.request(options, (proxyRes) => {
    let body = [];

    proxyRes.on("data", (chunk) => body.push(chunk));
    proxyRes.on("end", () => {
      const buffer = Buffer.concat(body);
      let contentType = proxyRes.headers["content-type"] || "";

      // ---- HTML の場合は書き換え ----
      if (contentType.includes("text/html")) {
        let html = buffer.toString("utf8");

        // <head> に <base> を注入（相対URL解決）
        html = html.replace(
          /<head([^>]*)>/i,
          `<head$1><base href="${targetUrl.origin}">`
        );

        // URL を proxy 経由に書き換え
        html = html.replace(
          /((src|href)=["'])(https?:\/\/[^"']+)/gi,
          (match, prefix, _, url) => `${prefix}/proxy?url=${encodeURIComponent(url)}`
        );

        // セキュリティヘッダを削除
        res.removeHeader("Content-Security-Policy");
        res.removeHeader("X-Frame-Options");

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(proxyRes.statusCode).send(html);
      } else {
        // HTML 以外はそのまま返す
        res.setHeader("Content-Type", contentType);
        res.status(proxyRes.statusCode).send(buffer);
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy request failed");
  });

  proxyReq.end();
});

app.listen(PORT, () => {
  console.log(`✅ Proxy running at http://localhost:${PORT}`);
});
