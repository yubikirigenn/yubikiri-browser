// proxy.js
const express = require("express");
const axios = require("axios");
require("axios-cookiejar-support").default && require("axios-cookiejar-support").default(axios);
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");

const router = express.Router();

function copyResponseHeaders(srcHeaders, res) {
  const forbidden = new Set([
    "transfer-encoding","content-encoding","content-length","connection",
    "keep-alive","proxy-authenticate","proxy-authorization","te","trailer","upgrade"
  ]);
  Object.entries(srcHeaders || {}).forEach(([k, v]) => {
    if (!forbidden.has(k.toLowerCase())) {
      res.set(k, v);
    }
  });
}

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

function rewriteSrcset(value, base) {
  if (!value) return value;
  return value.split(",").map(part => {
    const [urlPart, descriptor] = part.trim().split(/\s+/, 2);
    const rewritten = toProxyUrl(urlPart, base);
    return descriptor ? `${rewritten} ${descriptor}` : rewritten;
  }).join(", ");
}

function rewriteCssUrls(cssText, base) {
  if (!cssText) return cssText;
  return cssText.replace(/url\(([^)]+)\)/g, (match, urlStr) => {
    const cleaned = urlStr.replace(/^['"]|['"]$/g, "").trim();
    if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("javascript:")) return match;
    return `url(${toProxyUrl(cleaned, base)})`;
  });
}

// 全メソッド対応（GET/POST 等）
router.all("/", async (req, res) => {
  let raw = req.query.url;
  if (!raw) return res.status(400).send("Missing url parameter");

  try {
    try { raw = decodeURIComponent(raw); } catch (e) {}

    const jar = new CookieJar();
    const outHeaders = Object.assign({}, req.headers);
    delete outHeaders.host;
    outHeaders["user-agent"] = outHeaders["user-agent"] || "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    if (!outHeaders.referer) {
      try { outHeaders.referer = new URL(raw).origin + "/"; } catch {}
    }

    const axiosConfig = {
      url: raw,
      method: req.method,
      headers: outHeaders,
      responseType: "arraybuffer",
      jar,
      withCredentials: true,
      maxRedirects: 6,
      validateStatus: status => status < 500
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      axiosConfig.data = req;
    }

    const upstream = await axios.request(axiosConfig);
    const contentType = (upstream.headers["content-type"] || "").toLowerCase();

    if (contentType.includes("text/html")) {
      let charset = "utf-8";
      const m = (upstream.headers["content-type"] || "").match(/charset=([^;,\s]+)/i);
      if (m) charset = m[1].toLowerCase();
      let html;
      try { html = upstream.data.toString(charset); } catch { html = upstream.data.toString("utf-8"); }

      const $ = cheerio.load(html, { decodeEntities: false });

      if ($("head base").length === 0) {
        $("head").prepend(`<base href="${raw}">`);
      }

      $("img").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src && !src.startsWith("data:")) $el.attr("src", toProxyUrl(src, raw));

        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, raw));
      });

      $("source").each((_, el) => {
        const $el = $(el);
        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, raw));
        const s = $el.attr("src");
        if (s && !s.startsWith("data:")) $el.attr("src", toProxyUrl(s, raw));
      });

      $("link").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (href) $el.attr("href", toProxyUrl(href, raw));
      });

      $("script").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) $el.attr("src", toProxyUrl(src, raw));
      });

      $("iframe").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src) $el.attr("src", toProxyUrl(src, raw));
      });

      $("style").each((_, el) => {
        const $el = $(el);
        const css = $el.html();
        if (css && css.includes("url(")) $el.html(rewriteCssUrls(css, raw));
      });

      $("[style]").each((_, el) => {
        const $el = $(el);
        const s = $el.attr("style");
        if (s && s.includes("url(")) $el.attr("style", rewriteCssUrls(s, raw));
      });

      const outHtml = $.html();
      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/html; charset=utf-8");
      copyResponseHeaders(upstream.headers, res);
      res.send(outHtml);
      return;
    }

    if (contentType.includes("text/css")) {
      let css;
      try { css = upstream.data.toString("utf-8"); } catch { css = upstream.data.toString(); }
      const newCss = rewriteCssUrls(css, raw);
      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/css; charset=utf-8");
      copyResponseHeaders(upstream.headers, res);
      res.send(newCss);
      return;
    }

    // バイナリ等はそのまま
    res.status(upstream.status || 200);
    copyResponseHeaders(upstream.headers, res);
    if (upstream.headers["content-type"]) res.set("Content-Type", upstream.headers["content-type"]);
    res.send(Buffer.from(upstream.data));
  } catch (err) {
    console.error("Proxy error:", err && err.message ? err.message : err);
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
      } catch (e) {}
    }
    res.status(500).send("Proxy error: " + (err && err.message ? err.message : "unknown"));
  }
});

module.exports = router;
