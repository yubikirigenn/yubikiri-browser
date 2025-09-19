// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");
const router = express.Router();

function buildProxyBase(req) {
  return `${req.protocol}://${req.get("host")}`;
}
function absUrl(urlLike, base) {
  try { return new URL(urlLike, base).toString(); } catch(e){ return null; }
}
function rewriteCssUrls(cssText, targetBase, proxyBase) {
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    const a = absUrl(u, targetBase);
    if (!a) return m;
    return `url("${proxyBase}/proxy?url=${encodeURIComponent(a)}")`;
  });
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  console.log("=== Proxy Request Start ===");
  console.log("Incoming:", req.originalUrl, "From:", req.ip);

  if (!targetUrl) {
    console.warn("No url param");
    return res.status(400).send("Missing url parameter");
  }

  // ベーシックなブラウザっぽいヘッダ
  const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: targetUrl,
    "Upgrade-Insecure-Requests": "1"
  };

  try {
    // ターゲットから arraybuffer で取得（バイナリも扱えるように）
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: defaultHeaders,
      maxRedirects: 5,
      timeout: 20000,
      validateStatus: () => true // axios による例外化を防ぐ（ステータスは自前で処理）
    });

    console.log("Target URL:", targetUrl, "=> status", response.status);
    const ct = (response.headers["content-type"] || "").toLowerCase();
    const proxyBase = buildProxyBase(req);

    // ターゲットが 4xx/5xx を返している場合はそのステータスで返す（デバッグのため body 部分を簡潔に示す）
    if (response.status >= 400) {
      const snippet = response.data && response.data.length ? response.data.toString("utf8").slice(0, 200) : "";
      console.warn("Target returned error status", response.status);
      return res.status(response.status).send(
        `<pre style="white-space:pre-wrap;">Proxy: target returned ${response.status}\n\nSnippet:\n${snippet.replace(/</g,'&lt;')}</pre>`
      );
    }

    // HTML のときは書き換え
    if (ct.includes("text/html")) {
      let html;
      try {
        html = response.data.toString("utf8");
      } catch (e) {
        // もしutf8で失敗したらバイナリをlatin1で取る（とりあえず見えるようにする）
        html = response.data.toString("latin1");
      }

      let $;
      try {
        $ = cheerio.load(html, { decodeEntities: false });
      } catch (e) {
        console.error("cheerio.load failed:", e && e.stack ? e.stack : e);
        // パース失敗なら生HTMLを返す（またはエラーとして返す）
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      }

      // CSP系を除去
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('meta[name="Content-Security-Policy"]').remove();
      $('base').remove();

      // 属性を書き換え
      const ATTRS = ["src","href","action","data-src","data-href"];
      $("*").each((_, el) => {
        ATTRS.forEach(attr => {
          const v = $(el).attr(attr);
          if (!v) return;
          if (/^\s*(data:|javascript:|mailto:|#)/i.test(v)) return;
          const absolute = absUrl(v, targetUrl);
          if (!absolute) return;
          $(el).attr(attr, `${proxyBase}/proxy?url=${encodeURIComponent(absolute)}`);
        });

        const srcset = $(el).attr("srcset");
        if (srcset) {
          const parts = srcset.split(",");
          const rewritten = parts.map(p=>{
            const [u, descriptor] = p.trim().split(/\s+/,2);
            if (!u) return "";
            if (/^\s*(data:|javascript:|#)/i.test(u)) return p.trim();
            const absolute = absUrl(u, targetUrl);
            if (!absolute) return "";
            return `${proxyBase}/proxy?url=${encodeURIComponent(absolute)}${descriptor ? " " + descriptor : ""}`;
          }).filter(Boolean).join(", ");
          $(el).attr("srcset", rewritten);
        }

        const style = $(el).attr("style");
        if (style && style.includes("url(")) {
          $(el).attr("style", rewriteCssUrls(style, targetUrl, proxyBase));
        }
      });

      $("style").each((_, el)=>{
        const txt = $(el).html();
        if (txt && txt.includes("url(")) {
          $(el).html(rewriteCssUrls(txt, targetUrl, proxyBase));
        }
      });

      // meta refresh 書き換え
      $('meta[http-equiv="refresh"]').each((_, el)=>{
        const content = $(el).attr("content");
        if (!content) return;
        const m = content.match(/^\s*([\d]+)\s*;\s*url=(.*)/i);
        if (m) {
          const urlPart = m[2].replace(/^["']|["']$/g,"");
          const absolute = absUrl(urlPart, targetUrl);
          if (absolute) {
            $(el).attr("content", `${m[1]};url=${proxyBase}/proxy?url=${encodeURIComponent(absolute)}`);
          }
        }
      });

      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Frame-Options", "ALLOWALL");
      return res.send($.html());
    }

    // CSS の場合
    if (ct.includes("text/css") || ct.includes("text/x-css")) {
      let cssText = response.data.toString("utf8");
      cssText = rewriteCssUrls(cssText, targetUrl, proxyBase);
      res.set("Content-Type", "text/css; charset=utf-8");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Frame-Options", "ALLOWALL");
      return res.send(cssText);
    }

    // それ以外はバイナリそのまま
    const contentTypeHeader = response.headers["content-type"] || "application/octet-stream";
    res.set("Content-Type", contentTypeHeader);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("X-Frame-Options", "ALLOWALL");
    if (response.headers["cache-control"]) res.set("Cache-Control", response.headers["cache-control"]);
    return res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("Proxy internal error:", err && err.stack ? err.stack : err);
    // 詳細をログに残して 500
    return res.status(500).send("Proxy internal error: " + (err && err.message ? err.message : String(err)));
  }
});

module.exports = router;
