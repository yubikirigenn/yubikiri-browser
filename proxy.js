// proxy.js
const express = require("express");
const axios = require("axios");
require("axios-cookiejar-support").default(axios); // axios を拡張
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");

const router = express.Router();

// hop-by-hop ヘッダ等を除外してコピーする補助
function copyResponseHeaders(srcHeaders, res) {
  const forbidden = new Set([
    "transfer-encoding",
    "content-encoding",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "upgrade"
  ]);
  Object.entries(srcHeaders || {}).forEach(([k, v]) => {
    if (!forbidden.has(k.toLowerCase())) {
      res.set(k, v);
    }
  });
}

// URL を絶対化して proxy 経由 URL に変換
function toProxyUrl(src, base) {
  if (!src) return src;
  const t = src.trim();
  if (t.startsWith("data:") || t.startsWith("javascript:") || t.startsWith("#")) return src;
  try {
    const absolute = new URL(t, base).toString();
    return `/proxy?url=${encodeURIComponent(absolute)}`;
  } catch (e) {
    return src;
  }
}

// srcset の書き換え (img の srcset 等)
function rewriteSrcset(value, base) {
  if (!value) return value;
  return value
    .split(",")
    .map(part => {
      const [urlPart, descriptor] = part.trim().split(/\s+/, 2);
      const rewritten = toProxyUrl(urlPart, base);
      return descriptor ? `${rewritten} ${descriptor}` : rewritten;
    })
    .join(", ");
}

// CSS 内の url(...) を書き換える
function rewriteCssUrls(cssText, base) {
  if (!cssText) return cssText;
  return cssText.replace(/url\(([^)]+)\)/g, (match, urlStr) => {
    const cleaned = urlStr.replace(/^['"]|['"]$/g, "").trim();
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:")) return match;
    return `url(${toProxyUrl(cleaned, base)})`;
  });
}

// 主処理：全メソッド受け付け
router.all("/", async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send("Missing url parameter");

  // decode
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(raw);
  } catch {
    targetUrl = raw;
  }

  try {
    const jar = new CookieJar();

    // コピーするヘッダ（最小限） — 元ヘッダを丸ごと渡すと問題になるサイトがあるため調整
    const outHeaders = Object.assign({}, req.headers);
    delete outHeaders.host; // host は外す
    // 強制的に User-Agent を付与（必要なら調整）
    outHeaders["user-agent"] =
      outHeaders["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    // Set Referer to origin of target if not present
    if (!outHeaders.referer) {
      try {
        const u = new URL(targetUrl);
        outHeaders.referer = u.origin + "/";
      } catch (e) {}
    }

    // axios リクエスト設定
    const axiosConfig = {
      url: targetUrl,
      method: req.method,
      headers: outHeaders,
      responseType: "arraybuffer",
      jar,
      withCredentials: true,
      maxRedirects: 6,
      validateStatus: status => status < 500 // 4xx でも内容を受け取る
    };

    // POST/PUT/PATCH 等は body を stream として渡す（express の bodyParser を使っていない想定）
    if (req.method !== "GET" && req.method !== "HEAD") {
      // req is a readable stream; axios can accept a stream as data
      axiosConfig.data = req;
    }

    const upstream = await axios.request(axiosConfig);

    const contentType = (upstream.headers["content-type"] || "").toLowerCase();

    // HTML のときは書き換えを行う
    if (contentType.includes("text/html")) {
      // バッファを文字列に変換（多くは UTF-8 だが charset があれば使う）
      let charset = "utf-8";
      const ct = upstream.headers["content-type"] || "";
      const m = ct.match(/charset=([^;,\s]+)/i);
      if (m) charset = m[1].toLowerCase();

      let html;
      try {
        html = upstream.data.toString(charset);
      } catch (e) {
        // フォールバック
        html = upstream.data.toString("utf-8");
      }

      const $ = cheerio.load(html, { decodeEntities: false });

      // head に base を追加（既にあれば上書きしない）
      if ($("head base").length === 0) {
        $("head").prepend(`<base href="${targetUrl}">`);
      }

      // img の src, srcset
      $("img").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src && !src.startsWith("data:")) $el.attr("src", toProxyUrl(src, targetUrl));

        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, targetUrl));
      });

      // picture > source の srcset
      $("source").each((_, el) => {
        const $el = $(el);
        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, targetUrl));

        const src = $el.attr("src");
        if (src && !src.startsWith("data:")) $el.attr("src", toProxyUrl(src, targetUrl));
      });

      // link (CSS 等)
      $("link").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;
        // 相対リンクも含めて絶対化してプロキシ化
        $el.attr("href", toProxyUrl(href, targetUrl));
      });

      // script src
      $("script").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) $el.attr("src", toProxyUrl(src, targetUrl));
      });

      // iframe src
      $("iframe").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) $el.attr("src", toProxyUrl(src, targetUrl));
      });

      // style タグ内の url(...)
      $("style").each((_, el) => {
        const $el = $(el);
        const css = $el.html();
        if (css && css.includes("url(")) {
          $el.html(rewriteCssUrls(css, targetUrl));
        }
      });

      // inline style 属性の書き換え
      $("[style]").each((_, el) => {
        const $el = $(el);
        const s = $el.attr("style");
        if (s && s.includes("url(")) {
          $el.attr("style", rewriteCssUrls(s, targetUrl));
        }
      });

      // HTML 内の inline の src/href を持つ任意の要素も対象 (a[href] はあまり書き換えない方が良いが必要なら)
      // ここは必要に応じて追加可能

      const outHtml = $.html();

      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/html; charset=utf-8");
      // 他の安全なヘッダだけコピー
      copyResponseHeaders(upstream.headers, res);
      res.send(outHtml);
      return;
    }

    // CSS のときは中身を書き換えて返す（相対 URL をプロキシ経由に）
    if (contentType.includes("text/css")) {
      let css;
      try {
        css = upstream.data.toString("utf-8");
      } catch {
        css = upstream.data.toString();
      }
      const newCss = rewriteCssUrls(css, targetUrl);
      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/css; charset=utf-8");
      copyResponseHeaders(upstream.headers, res);
      res.send(newCss);
      return;
    }

    // それ以外（画像・フォント・JS 等のバイナリ）はそのまま返す
    res.status(upstream.status || 200);
    // コピー可能なヘッダを設定
    copyResponseHeaders(upstream.headers, res);
    // content-type は上書きしておく
    if (upstream.headers["content-type"]) res.set("Content-Type", upstream.headers["content-type"]);
    // バイナリ送信
    res.send(Buffer.from(upstream.data));
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : err);
    // もし axios のレスポンスがある場合は中身を返す（403/404 等）
    if (err.response && err.response.data) {
      try {
        const ct = err.response.headers && err.response.headers["content-type"];
        if (ct && ct.includes("text/html")) {
          let body = err.response.data.toString("utf-8");
          return res.status(err.response.status || 500).set("Content-Type", ct).send(body);
        } else {
          res.status(err.response.status || 500);
          copyResponseHeaders(err.response.headers, res);
          return res.send(Buffer.from(err.response.data));
        }
      } catch (e) {
        // fallthrough
      }
    }

    res.status(500).send("Proxy error: " + (err && err.message ? err.message : "unknown"));
  }
});

module.exports = router;
