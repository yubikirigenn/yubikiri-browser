// proxy.js をベースに追加
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

// --- iframe 判定関数 ---
async function canIframe(url, origin) {
  try {
    const resp = await axios.head(url, { timeout: 5000, maxRedirects: 5 }).catch(e => e.response || null);
    if (!resp) return false;

    const headers = resp.headers;
    const xfo = (headers['x-frame-options'] || '').toLowerCase();
    const csp = headers['content-security-policy'] || headers['x-content-security-policy'] || '';

    // X-Frame-Options 判定
    if (xfo.includes('deny')) return false;
    if (xfo.includes('sameorigin')) {
      const urlHost = new URL(url).host;
      if (urlHost !== new URL(origin).host) return false;
    }

    // CSP frame-ancestors 判定（簡易）
    if (csp) {
      const m = /frame-ancestors\s+([^;]+)/i.exec(csp);
      if (m) {
        const val = m[1].trim();
        if (val === "'none'" || (!val.includes(origin) && !val.includes('*'))) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

// --- iframe 判定用エンドポイント ---
router.get("/can-iframe", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ ok: false, allow: false, reason: 'Missing url' });

  const origin = req.protocol + "://" + req.get("host");
  const allow = await canIframe(targetUrl, origin);
  res.json({ ok: true, allowIframe: allow });
});

// --- 完全プロキシ本体 ---
router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const contentType = response.headers["content-type"] || "";

    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html);

      // img, link, script タグを書き換え
      $("img").each((_, el) => {
        const src = $(el).attr("src");
        if (src && !src.startsWith("data:")) {
          $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
        }
      });
      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) $(el).attr("href", `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
      });
      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) $(el).attr("src", `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
      });

      res.set("Content-Type", "text/html");
      res.send($.html());
    } else {
      res.set("Content-Type", contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy error: " + err.message);
  }
});

module.exports = router;
