// proxy.js
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");
const router = express.Router();

// 簡易 cookie store: { hostname -> {name: value, ...} }
const cookieStore = new Map();

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
function parseSetCookieArray(setCookieArr, host) {
  if (!setCookieArr || !Array.isArray(setCookieArr)) return;
  const map = cookieStore.get(host) || {};
  setCookieArr.forEach(sc => {
    const kv = sc.split(";")[0];
    const idx = kv.indexOf("=");
    if (idx > 0) {
      const name = kv.slice(0, idx).trim();
      const value = kv.slice(idx+1).trim();
      map[name] = value;
    }
  });
  cookieStore.set(host, map);
}
function buildCookieHeaderForHost(host) {
  const map = cookieStore.get(host);
  if (!map) return null;
  return Object.entries(map).map(([k,v])=>`${k}=${v}`).join("; ");
}

// 複数プリセット（User-Agent, Accept, Referer 等）を試す
const HEADER_PRESETS = [
  { name: "chrome", headers: {
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language":"ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      "Upgrade-Insecure-Requests":"1"
  }},
  { name: "safari", headers: {
      "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
      "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"ja-JP,ja;q=0.9"
  }},
  { name: "minimal", headers: {
      "User-Agent":"Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)",
      "Accept":"*/*"
  }}
];

async function tryFetch(targetUrl, clientIp) {
  const host = (() => { try { return new URL(targetUrl).hostname; } catch(e){ return null; }})();
  for (let i = 0; i < HEADER_PRESETS.length; i++) {
    const preset = HEADER_PRESETS[i];
    const headers = Object.assign({}, preset.headers, {
      Referer: targetUrl,
      // optional: X-Forwarded-For を入れてみる（効果は限定的）
      "X-Forwarded-For": clientIp || ""
    });
    const cookieHeader = host ? buildCookieHeaderForHost(host) : null;
    if (cookieHeader) headers["Cookie"] = cookieHeader;

    console.log(`[proxy] attempt ${i+1}/${HEADER_PRESETS.length} preset=${preset.name} url=${targetUrl}`);
    try {
      const resp = await axios.get(targetUrl, {
        responseType: "arraybuffer",
        headers,
        maxRedirects: 5,
        timeout: 20000,
        validateStatus: () => true
      });

      // store cookies
      if (host && resp.headers && resp.headers["set-cookie"]) {
        parseSetCookieArray(resp.headers["set-cookie"], host);
      }

      // if not 403, return
      if (resp.status !== 403) {
        console.log(`[proxy] got status ${resp.status} with preset=${preset.name}`);
        return resp;
      } else {
        console.warn(`[proxy] 403 from target with preset=${preset.name}`);
        // try next preset
      }
    } catch (e) {
      console.error("[proxy] fetch error", e && e.message ? e.message : e);
      // try next preset
    }
  }

  // 最後に一回、ヘッダを更に変えて試す（Refererなしなど）
  try {
    console.log("[proxy] final attempt with bare headers");
    const resp = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept":"*/*"
      },
      maxRedirects: 5,
      timeout: 20000,
      validateStatus: () => true
    });
    if (host && resp.headers && resp.headers["set-cookie"]) {
      parseSetCookieArray(resp.headers["set-cookie"], host);
    }
    return resp;
  } catch (e) {
    console.error("[proxy] final fetch error", e && e.message ? e.message : e);
    throw e;
  }
}

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  console.log("=== Proxy Request Start ===", req.ip, req.originalUrl);
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    const resp = await tryFetch(targetUrl, req.ip);
    console.log("Target URL:", targetUrl, "=> status", resp.status);

    const contentType = (resp.headers["content-type"] || "").toLowerCase();
    const proxyBase = buildProxyBase(req);

    if (resp.status >= 400) {
      const snippet = resp.data && resp.data.length ? resp.data.toString("utf8").slice(0,200) : "";
      console.warn("Target returned status", resp.status);
      res.status(resp.status).set("Content-Type","text/html; charset=utf-8").send(
        `<pre style="white-space:pre-wrap;">Proxy: target returned ${resp.status}\n\nSnippet:\n${snippet.replace(/</g,'&lt;')}</pre>`
      );
      return;
    }

    if (contentType.includes("text/html")) {
      let html = resp.data.toString("utf8");
      const $ = cheerio.load(html, { decodeEntities: false });

      // remove CSP / base tags
      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('meta[name="Content-Security-Policy"]').remove();
      $('base').remove();

      // rewrite attributes
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

        // srcset
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

        // inline style url()
        const style = $(el).attr("style");
        if (style && style.includes("url(")) {
          $(el).attr("style", rewriteCssUrls(style, targetUrl, proxyBase));
        }
      });

      // style blocks
      $("style").each((_, el)=>{
        const txt = $(el).html();
        if (txt && txt.includes("url(")) {
          $(el).html(rewriteCssUrls(txt, targetUrl, proxyBase));
        }
      });

      // meta refresh
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

      res.set("Content-Type","text/html; charset=utf-8");
      res.set("Access-Control-Allow-Origin","*");
      res.set("X-Frame-Options","ALLOWALL");
      return res.send($.html());
    }

    if (contentType.includes("text/css")) {
      let cssText = resp.data.toString("utf8");
      cssText = rewriteCssUrls(cssText, targetUrl, proxyBase);
      res.set("Content-Type","text/css; charset=utf-8");
      res.set("Access-Control-Allow-Origin","*");
      res.set("X-Frame-Options","ALLOWALL");
      return res.send(cssText);
    }

    // その他はそのまま
    res.set("Content-Type", resp.headers["content-type"] || "application/octet-stream");
    res.set("Access-Control-Allow-Origin","*");
    res.set("X-Frame-Options","ALLOWALL");
    if (resp.headers["cache-control"]) res.set("Cache-Control", resp.headers["cache-control"]);
    return res.send(Buffer.from(resp.data));
  } catch (err) {
    console.error("Proxy internal error:", err && err.stack ? err.stack : err);
    return res.status(500).send("Proxy internal error: " + (err && err.message ? err.message : String(err)));
  }
});

module.exports = router;
