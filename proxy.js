// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");
const router = express.Router();

function buildProxyBase(req) {
  // req.protocol may be 'http' or 'https' depending on hosting
  // req.get('host') は host:port を返します
  return `${req.protocol}://${req.get("host")}`;
}

function absUrl(urlLike, base) {
  try {
    return new URL(urlLike, base).toString();
  } catch (e) {
    return null;
  }
}

function rewriteCssUrls(cssText, targetBase, proxyBase) {
  // cssText: string, targetBase: original page url, proxyBase: our proxy origin
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    const a = absUrl(u, targetBase);
    if (!a) return m;
    return `url("${proxyBase}/proxy?url=${encodeURIComponent(a)}")`;
  });
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  console.log("=== Proxy Request Start ===");
  console.log("Target URL:", targetUrl);

  // ヘッダー偽装（ブラウザっぽく）
  const defaultHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: targetUrl,
    "Upgrade-Insecure-Requests": "1"
  };

  try {
    // GET で arraybuffer（バイナリも扱えるように）
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      maxRedirects: 5,
      timeout: 20000,
      headers: defaultHeaders,
      validateStatus: (s) => true // ステータスは自前で判定
    });

    console.log("Target URL:", targetUrl, "=>", "status", response.status);

    if (response.status >= 400) {
      // 403 等はここで分かる。詳細ログを残す。
      console.warn("Target responded with status", response.status);
      return res
        .status(500)
        .send(`Proxy error: target responded ${response.status}`);
    }

    const contentType = (response.headers["content-type"] || "").toLowerCase();
    const proxyBase = buildProxyBase(req);

    // HTML の場合：cheerio で書き換え
    if (contentType.includes("text/html")) {
      // 文字コードは多くが utf-8 だが、別のサイトでは文字化けすることがあります。
      const html = response.data.toString("utf8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // remove CSP meta tags to avoid blocking
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('meta[name="Content-Security-Policy"]').remove();

      // rewrite <base>（存在する場合は削除しておく — 相対解決をサーバ側で行う）
      $('base').remove();

      // 全ての要素について src / href 書き換え
      const ATTRS = ["src", "href", "action", "data-src", "data-href"];
      $("*").each((_, el) => {
        ATTRS.forEach((attr) => {
          const v = $(el).attr(attr);
          if (!v) return;
          // data: や javascript: はそのまま
          if (/^\s*(data:|javascript:|mailto:|#)/i.test(v)) return;
          const absolute = absUrl(v, targetUrl);
          if (!absolute) return;
          $(el).attr(attr, `${proxyBase}/proxy?url=${encodeURIComponent(absolute)}`);
        });

        // srcset の処理（画像のレスポンシブ）
        const srcset = $(el).attr("srcset");
        if (srcset) {
          const parts = srcset.split(",");
          const rewritten = parts
            .map((p) => {
              const [u, descriptor] = p.trim().split(/\s+/, 2);
              if (!u) return "";
              if (/^\s*(data:|javascript:|#)/i.test(u)) return p.trim();
              const absolute = absUrl(u, targetUrl);
              if (!absolute) return "";
              return `${proxyBase}/proxy?url=${encodeURIComponent(absolute)}${descriptor ? " " + descriptor : ""}`;
            })
            .filter(Boolean)
            .join(", ");
          $(el).attr("srcset", rewritten);
        }

        // style 属性内の url(...) を書き換え
        const style = $(el).attr("style");
        if (style && style.includes("url(")) {
          $(el).attr("style", rewriteCssUrls(style, targetUrl, proxyBase));
        }
      });

      // <link rel="stylesheet"> は href を書き換える（上のループで処理されているはず）
      // <script src> は上のループで処理（ただし inline script はそのまま）

      // <style> タグの中身も書き換え
      $("style").each((_, el) => {
        const txt = $(el).html();
        if (txt && txt.includes("url(")) {
          $(el).html(rewriteCssUrls(txt, targetUrl, proxyBase));
        }
      });

      // meta refresh の書き換え (例: content="5;url=/path")
      $('meta[http-equiv="refresh"]').each((_, el) => {
        const content = $(el).attr("content");
        if (!content) return;
        const m = content.match(/^\s*([\d]+)\s*;\s*url=(.*)/i);
        if (m) {
          const urlPart = m[2].replace(/^["']|["']$/g, "");
          const absolute = absUrl(urlPart, targetUrl);
          if (absolute) {
            $(el).attr("content", `${m[1]};url=${proxyBase}/proxy?url=${encodeURIComponent(absolute)}`);
          }
        }
      });

      // 返却する際のヘッダ調整（CSP等でブロックされないよう緩める）
      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Frame-Options", "ALLOWALL");
      // 送るHTMLを取得して返す
      const out = $.html();
      console.log("Rewriting complete, sending HTML length:", out.length);
      return res.send(out);
    }

    // CSS の場合（content-type に text/css が含まれる）: url(...) を書き換えて返す
    if (contentType.includes("text/css") || contentType.includes("text/x-css")) {
      const cssText = response.data.toString("utf8");
      const rewritten = rewriteCssUrls(cssText, targetUrl, proxyBase);
      res.set("Content-Type", "text/css; charset=utf-8");
      res.set("Access-Control-Allow-Origin", "*");
      res.set("X-Frame-Options", "ALLOWALL");
      return res.send(rewritten);
    }

    // それ以外（画像・フォント・JSなど）はバイナリのまま返す
    // ただし、content-type をベタにセット（元のまま）
    const ct = response.headers["content-type"] || "application/octet-stream";
    res.set("Content-Type", ct);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("X-Frame-Options", "ALLOWALL");
    // 可能ならキャッシュ制御を元のまま渡す（ただし安全のため可変）
    if (response.headers["cache-control"]) {
      res.set("Cache-Control", response.headers["cache-control"]);
    }

    // バイナリ response.data は Buffer（arraybuffer）になっている
    return res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : err);
    // 詳細ログ（target のステータスが取得できる場合）
    if (err.response) {
      console.error("Target URL:", targetUrl, "status:", err.response.status);
    }
    return res.status(500).send("Proxy error: " + (err.message || String(err)));
  }
});

module.exports = router;
