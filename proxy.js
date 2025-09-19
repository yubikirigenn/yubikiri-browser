// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

/**
 * ブラウザっぽいヘッダを作る
 */
function makeHeaders(targetUrl, userAgent) {
  const origin = (() => {
    try { return new URL(targetUrl).origin; } catch(e) { return undefined; }
  })();

  return {
    "User-Agent": userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": origin || "",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    // sec-fetch は場合によっては有効（最初は送る）
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document"
  };
}

/**
 * CSS 内の url(...) と @import をプロキシパスに書き換える
 */
function rewriteCssUrls(cssText, baseUrl) {
  // url(...) を全て検出して /proxy?url=... に置換
  const replaced = cssText.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/g, (m, quote, url) => {
    // data: スキップ
    if (/^\s*data:/i.test(url)) return `url(${quote}${url}${quote})`;
    try {
      const resolved = new URL(url, baseUrl).toString();
      return `url(${quote}/proxy?url=${encodeURIComponent(resolved)}${quote})`;
    } catch(e) {
      return m;
    }
  }).replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, url) => {
    try {
      const resolved = new URL(url, baseUrl).toString();
      return `@import "${'/proxy?url=' + encodeURIComponent(resolved)}"`;
    } catch(e) {
      return m;
    }
  });
  return replaced;
}

/**
 * HTML 内のリンク等を書き換え（img, script, link, a, source, iframe の src/href/srcset 等）
 */
function rewriteHtml($, baseUrl) {
  // img
  $("img").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (src && !src.startsWith("data:")) {
      try { $el.attr("src", `/proxy?url=${encodeURIComponent(new URL(src, baseUrl).toString())}`); } catch(e){}
    }
    // srcset
    const srcset = $el.attr("srcset");
    if (srcset) {
      const newSrcset = srcset.split(",").map(part => {
        const [urlPart, size] = part.trim().split(/\s+/);
        try {
          const resolved = new URL(urlPart, baseUrl).toString();
          return `/proxy?url=${encodeURIComponent(resolved)}${size ? ' ' + size : ''}`;
        } catch(e) {
          return part;
        }
      }).join(", ");
      $el.attr("srcset", newSrcset);
    }
  });

  // link (css, preloads)
  $("link").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (href) {
      try { $el.attr("href", `/proxy?url=${encodeURIComponent(new URL(href, baseUrl).toString())}`); } catch(e){}
    }
  });

  // script
  $("script").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (src) {
      try { $el.attr("src", `/proxy?url=${encodeURIComponent(new URL(src, baseUrl).toString())}`); } catch(e){}
    } else {
      // インラインスクリプトはそのまま
    }
  });

  // a タグ（リンク先） - 必要ならプロキシを通す（外部へ飛ばしたい場合はコメントアウト）
  $("a").each((_, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("javascript:")) {
      try { $el.attr("href", `/proxy?url=${encodeURIComponent(new URL(href, baseUrl).toString())}`); } catch(e){}
    }
  });

  // source, video, audio, iframe
  $("source, video, audio, iframe").each((_, el) => {
    const $el = $(el);
    const src = $el.attr("src");
    if (src && !src.startsWith("data:")) {
      try { $el.attr("src", `/proxy?url=${encodeURIComponent(new URL(src, baseUrl).toString())}`); } catch(e){}
    }
  });

  // style attribute 内の url(...)
  $("[style]").each((_, el) => {
    const $el = $(el);
    const style = $el.attr("style");
    if (style && style.includes("url(")) {
      $el.attr("style", rewriteCssUrls(style, baseUrl));
    }
  });
}

/**
 * メインルート
 */
router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  // targetUrl がエンコード済みで来る可能性を考慮
  const decoded = decodeURIComponent(targetUrl);

  // axios instance（バイナリ対応、リダイレクト許可）
  const ax = axios.create({
    responseType: "arraybuffer",
    maxRedirects: 10,
    validateStatus: null,
    timeout: 15000
  });

  // try fetch with primary headers, on 403 try alternate
  async function fetchOnce(url, attempt = 1) {
    const uaPrimary = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const uaAlt = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15";
    const headers = makeHeaders(url, attempt === 1 ? uaPrimary : uaAlt);

    try {
      console.log("=== Proxy Request Start ===");
      console.log("Target URL:", url);
      const response = await ax.get(url, { headers });
      console.log("Response status:", response.status);
      // expose some response headers for debugging
      // console.log("Resp headers:", response.headers);
      return response;
    } catch (e) {
      console.error("fetchOnce error:", e && e.message ? e.message : e);
      throw e;
    }
  }

  try {
    // 1回目
    let response = await fetchOnce(decoded, 1);

    // 403 の場合は 1 回だけ UA を変えてリトライ
    if (response.status === 403) {
      console.warn("Got 403, trying alt UA...");
      response = await fetchOnce(decoded, 2);
    }

    const contentType = (response.headers && response.headers["content-type"]) ? response.headers["content-type"] : "";

    // デバッグ出力（Render のログに出る）
    console.log("Proxy: Target URL:", decoded, "Status:", response.status, "Content-Type:", contentType);

    // HTML の場合（text/html）
    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // 書き換えを実行
      rewriteHtml($, decoded);

      // CSS を inline/style 要素内でも書き換える（style タグ）
      $("style").each((_, el) => {
        const $el = $(el);
        const txt = $el.html();
        if (txt && txt.includes("url(")) {
          $el.html(rewriteCssUrls(txt, decoded));
        }
      });

      // <link rel="stylesheet"> の場合、ブラウザが /proxy?url=... を呼ぶので
      // そちらのレスポンス側で CSS 内書き換えをする（下の else branch が担当）
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send($.html());
      return;
    }

    // CSS の場合（text/css or css）
    if (contentType.includes("css")) {
      const cssText = response.data.toString("utf-8");
      const rewritten = rewriteCssUrls(cssText, decoded);
      res.set("Content-Type", contentType);
      res.send(rewritten);
      return;
    }

    // 画像 / バイナリなどはそのまま返す（arraybuffer）
    // 一部サイトは CORS ヘッダを必要とするが、proxy を通す場合は origin が同じなので問題は少ない
    res.set("Content-Type", contentType || "application/octet-stream");

    // Set some cache-control to reduce load (必要に応じて調整)
    res.set("Cache-Control", "no-store");

    res.send(response.data);
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : err);
    // 可能なら upstream のステータスを出す
    if (err.response && err.response.status) {
      console.error("Upstream status:", err.response.status);
      res.status(500).send(`Proxy error: Upstream status ${err.response.status}`);
    } else {
      res.status(500).send("Proxy error: " + (err.message || String(err)));
    }
  }
});

module.exports = router;
