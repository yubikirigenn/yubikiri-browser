// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const router = express.Router();

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function absUrl(ref, base) {
  try {
    return new URL(ref, base).toString();
  } catch (e) {
    return null;
  }
}

router.get("/", async (req, res) => {
  let targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  // 受け取り側で多重エンコードされている可能性に備えてデコード（安全策）
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (e) {
    /* ignore */
  }

  try {
    // binary でも text でも arraybuffer を取り、後で判定する
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: { "User-Agent": USER_AGENT }
    });

    const contentTypeRaw = response.headers["content-type"] || "";
    const contentType = contentTypeRaw.split(";")[0];

    // HTML の場合：cheerio でリソース URL を書き換える
    if (contentType.includes("text/html")) {
      const html = response.data.toString("utf-8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // rewrite <img src=...>
      $("img").each((_, el) => {
        const src = $(el).attr("src") || $(el).attr("data-src") || "";
        if (src && !src.startsWith("data:")) {
          const a = absUrl(src, targetUrl);
          if (a) $(el).attr("src", `/proxy?url=${encodeURIComponent(a)}`);
        }
      });

      // rewrite <link href=...> (主に CSS)
      $("link").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          const a = absUrl(href, targetUrl);
          if (a) $(el).attr("href", `/proxy?url=${encodeURIComponent(a)}`);
        }
      });

      // rewrite <script src=...>
      $("script").each((_, el) => {
        const src = $(el).attr("src");
        if (src) {
          const a = absUrl(src, targetUrl);
          if (a) {
            // 外部スクリプトは proxy 経由で取るようにし、ブラウザで確実に実行させるため
            $(el).attr("src", `/proxy?url=${encodeURIComponent(a)}`);
            // マークを付けてクライアント側で差し替え実行する（冗長対策）
            $(el).attr("data-proxied", "1");
          }
        } else {
          // inline scriptはそのまま残す（クライアント側で再実行）
          $(el).attr("data-proxied-inline", "1");
        }
      });

      // rewrite <a href> to absolute so in-page navigation works (optional)
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
          const a = absUrl(href, targetUrl);
          if (a) $(el).attr("href", `/proxy?url=${encodeURIComponent(a)}`);
        }
      });

      // 基本のヘッダ
      res.set("Content-Type", "text/html; charset=utf-8");
      // ブラウザからのクロス要求を一部回避するため（プロキシ経由で来るので安全）
      res.set("Access-Control-Allow-Origin", "*");
      res.send($.html());
      return;
    }

    // CSS の場合：url(...) を書き換える（fonts / images inside css）
    if (contentType.includes("text/css")) {
      const css = response.data.toString("utf-8");
      const rewritten = css.replace(/url\((?!['"]?data:)(['"]?)(.*?)\1\)/g, (m, q, p) => {
        const a = absUrl(p, targetUrl);
        if (a) {
          const prox = `/proxy?url=${encodeURIComponent(a)}`;
          return `url(${q}${prox}${q})`;
        }
        return m;
      });
      res.set("Content-Type", "text/css; charset=utf-8");
      res.set("Access-Control-Allow-Origin", "*");
      return res.send(rewritten);
    }

    // それ以外（画像・フォント・JSバイナリ等）はバイナリのまま返す
    const buf = Buffer.from(response.data);
    if (response.headers["content-length"]) {
      res.set("Content-Length", response.headers["content-length"]);
    }
    if (response.headers["cache-control"]) {
      res.set("Cache-Control", response.headers["cache-control"]);
    }
    res.set("Content-Type", contentTypeRaw || "application/octet-stream");
    res.set("Access-Control-Allow-Origin", "*");
    res.send(buf);
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : String(err));
    // 403 / 404 等はそのまま返す（可能なら元のステータスを転送）
    const status = (err.response && err.response.status) || 500;
    res.status(status).send("Proxy error: " + (err.message || "unknown"));
  }
});

module.exports = router;
