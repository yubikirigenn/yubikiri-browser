// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const router = express.Router();

/* ---------------- helpers ---------------- */

function copyResponseHeaders(srcHeaders, res) {
  const forbidden = new Set([
    "transfer-encoding","content-encoding","content-length","connection",
    "keep-alive","proxy-authenticate","proxy-authorization","te","trailer","upgrade"
  ]);
  // Remove CSP/X-Frame to avoid embedding/script blocking issues for proxied content
  const skip = new Set(["content-security-policy","x-frame-options","frame-options"]);
  Object.entries(srcHeaders || {}).forEach(([k, v]) => {
    const key = k.toLowerCase();
    if (forbidden.has(key) || skip.has(key)) return;
    res.set(k, v);
  });
  // Allow cross-origin for resources served through this proxy
  res.set("Access-Control-Allow-Origin", "*");
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
    try {
      const abs = new URL(cleaned, base).toString();
      return `url(/proxy?url=${encodeURIComponent(abs)})`;
    } catch {
      return match;
    }
  });
}

/**
 * scopeCss: 簡易スコーピング。全セレクタの先頭に scopeSelector を付与します。
 * 完全な CSS パーサーではないため万能ではありませんが、一般的なケースで有効です。
 */
function scopeCss(cssText, scopeSelector) {
  if (!cssText) return cssText;

  // handle @media blocks separately (simple recursion)
  cssText = cssText.replace(/@media[^{]+\{([\s\S]+?})\s*}/g, (m) => {
    const headerMatch = m.match(/^(@media[^{]+\{)/);
    const header = headerMatch ? headerMatch[1] : '';
    const inner = m.slice(header.length, -1); // drop final }
    const processedInner = scopeCss(inner, scopeSelector);
    return header + processedInner + '}';
  });

  // prefix top-level selectors (naive approach)
  cssText = cssText.replace(/(^|})(\s*)([^@{}\s][^{]*)\{/g, (full, br, ws, selectorPart) => {
    const selectors = selectorPart.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      if (s.startsWith(scopeSelector)) return s;
      if (s === 'html' || s === ':root') return scopeSelector;
      if (s === 'body') return scopeSelector;
      // add scope in front
      return `${scopeSelector} ${s}`;
    });
    return br + ws + selectors.join(', ') + ' {';
  });

  return cssText;
}

/* ---------------- main handler ---------------- */

router.all("/", async (req, res) => {
  let raw = req.query.url;
  if (!raw) return res.status(400).send("Missing url parameter");

  try {
    try { raw = decodeURIComponent(raw); } catch (e) {}

    // Prepare headers for upstream request
    const outHeaders = Object.assign({}, req.headers);
    delete outHeaders.host;
    outHeaders["user-agent"] = outHeaders["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    if (!outHeaders.referer) {
      try { outHeaders.referer = new URL(raw).origin + "/"; } catch {}
    }

    const axiosConfig = {
      url: raw,
      method: req.method,
      headers: outHeaders,
      responseType: "arraybuffer",
      maxRedirects: 6,
      validateStatus: status => status < 500
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      axiosConfig.data = req;
    }

    const upstream = await axios.request(axiosConfig);
    const contentType = (upstream.headers["content-type"] || "").toLowerCase();

    // HTML handling
    if (contentType.includes("text/html")) {
      let charset = "utf-8";
      const m = (upstream.headers["content-type"] || "").match(/charset=([^;,\s]+)/i);
      if (m) charset = m[1].toLowerCase();
      let html;
      try { html = upstream.data.toString(charset); } catch { html = upstream.data.toString("utf-8"); }

      const $ = cheerio.load(html, { decodeEntities: false });

      // ensure base tag so relative URLs resolve correctly in proxied document
      if ($("head base").length === 0) {
        const baseHref = (new URL(raw)).origin + (new URL(raw)).pathname.replace(/\/[^/]*$/, "/");
        $("head").prepend(`<base href="${baseHref}">`);
      }

      // wrap body contents in #proxy-root to scope CSS
      if ($("body").length) {
        if ($("#proxy-root").length === 0) {
          $("body").wrapInner('<div id="proxy-root"></div>');
        }
      } else {
        if ($("#proxy-root").length === 0) {
          $.root().prepend('<div id="proxy-root"></div>');
          const children = $.root().children().not('#proxy-root').toArray();
          children.forEach(ch => $('#proxy-root').append(ch));
        }
      }

      // process <style> tags (rewrite url() and scope)
      $("style").each((i, el) => {
        const $el = $(el);
        let cssText = $el.html() || "";
        cssText = rewriteCssUrls(cssText, raw);
        cssText = scopeCss(cssText, "#proxy-root");
        $el.html(cssText);
      });

      // rewrite inline style attributes
      $("[style]").each((i, el) => {
        const $el = $(el);
        const rawStyle = $el.attr("style") || "";
        $el.attr("style", rewriteCssUrls(rawStyle, raw));
      });

      // img, source rewrites
      $("img").each((_, el) => {
        const $el = $(el);
        const src = $el.attr("src");
        if (src && !src.startsWith("data:")) $el.attr("src", toProxyUrl(src, raw));
        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, raw));
      });

      $("source").each((_, el) => {
        const $el = $(el);
        const s = $el.attr("src");
        if (s && !s.startsWith("data:")) $el.attr("src", toProxyUrl(s, raw));
        const srcset = $el.attr("srcset");
        if (srcset) $el.attr("srcset", rewriteSrcset(srcset, raw));
      });

      // link rel=stylesheet
      $("link").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (href) $el.attr("href", toProxyUrl(href, raw));
      });

      // scripts and iframes
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

      const outHtml = $.html();
      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/html; charset=utf-8");
      copyResponseHeaders(upstream.headers, res);
      return res.send(outHtml);
    }

    // CSS handling: rewrite url() and scope to #proxy-root
    if (contentType.includes("text/css")) {
      let css;
      try { css = upstream.data.toString("utf-8"); } catch { css = upstream.data.toString(); }
      const cssUrlsRewritten = rewriteCssUrls(css, raw);
      const scopedCss = scopeCss(cssUrlsRewritten, "#proxy-root");

      res.status(upstream.status || 200);
      res.set("Content-Type", upstream.headers["content-type"] || "text/css; charset=utf-8");
      copyResponseHeaders(upstream.headers, res);
      return res.send(scopedCss);
    }

    // Other binary resources (images, fonts, etc.) – forward as-is
    res.status(upstream.status || 200);
    copyResponseHeaders(upstream.headers, res);
    if (upstream.headers["content-type"]) res.set("Content-Type", upstream.headers["content-type"]);
    return res.send(Buffer.from(upstream.data));
  } catch (err) {
    console.error("Proxy error:", err && err.stack ? err.stack : err);
    const msg = err && err.message ? err.message : "unknown";
    return res.status(500).send("Proxy error: " + msg);
  }
});

module.exports = router;
