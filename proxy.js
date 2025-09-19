// proxy.js（差し替え用）
const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const { URL } = require("url");
const router = express.Router();

const cookieStore = new Map();
function buildProxyBase(req) { return `${req.protocol}://${req.get("host")}`; }
function absUrl(urlLike, base) { try { return new URL(urlLike, base).toString(); } catch(e){ return null; } }
function rewriteCssUrls(cssText, targetBase, proxyBase) {
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    const a = absUrl(u, targetBase); if (!a) return m;
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

      // Log details every attempt (helpful to debug 403)
      console.log(`[proxy] attempt=${i+1} status=${resp.status} preset=${preset.name} content-type=${resp.headers['content-type'] || ''}`);
      if (resp.status === 403) {
        // log snippet of response body to help diagnose challenge pages
        let snippet = "";
        try { snippet = resp.data && resp.data.length ? resp.data.toString("utf8").slice(0,1000) : ""; } catch(e){ snippet = "[snippet-read-failed]"; }
        console.warn(`[proxy] 403 snippet(${snippet.length}):\n${snippet.replace(/</g,'&lt;')}`);
      }

      if (resp.status !== 403) return resp;
      // otherwise try next preset
    } catch (e) {
      console.error("[proxy] fetch error (attempt)", e && e.message ? e.message : e);
      // try next
    }
  }

  // final attempt (bare headers)
  try {
    console.log("[proxy] final bare attempt");
    const resp = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      headers: { "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept":"*/*" },
      maxRedirects: 5,
      timeout: 20000,
      validateStatus: () => true
    });
    if (host && resp.headers && resp.headers["set-cookie"]) parseSetCookieArray(resp.headers["set-cookie"], host);
    console.log("[proxy] final status", resp.status);
    if (resp.status === 403) {
      let snippet = "";
      try { snippet = resp.data && resp.data.length ? resp.data.toString("utf8").slice(0,1000) : ""; } catch(e){ snippet = "[snippet-read-failed]"; }
      console.warn(`[proxy] final 403 snippet:\n${snippet.replace(/</g,'&lt;')}`);
    }
    return resp;
  } catch (e) {
    console.error("[proxy] final fetch error", e && e.message ? e.message : e);
    throw e;
  }
}

/* ------------- OPTIONAL Playwright fallback ------------- */
/* 使いたい場合は: npm i playwright
   環境によっては追加設定が必要です（Renderで動かすなら要確認）。
   有効化は後述のルート内で query.forcePlaywright をチェックして行ってください。
*/
async function fetchWithPlaywright(url) {
  // lazy require so server still runs when playwright is not installed
  const { chromium } = require('playwright'); // 例: chrome系
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'], headless: true });
  try {
    const page = await browser.newPage({ userAgent: HEADER_PRESETS[0].headers['User-Agent'] });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const cookies = await page.context().cookies();
    // simplified cookies -> store into cookieStore if needed
    try {
      const host = new URL(url).hostname;
      const map = cookieStore.get(host) || {};
      cookies.forEach(c => { map[c.name] = c.value; });
      cookieStore.set(host, map);
    } catch(e){}
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, data: Buffer.from(html, 'utf8') };
  } finally {
    await browser.close();
  }
}
/* ------------------------------------------------------- */

router.get("/", async (req, res) => {
  const targetUrl = req.query.url;
  console.log("=== Proxy Request Start ===", req.ip, req.originalUrl);
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    // If caller requested playwright fallback explicitly:
    if (req.query.forcePlaywright === "1") {
      console.log("[proxy] using Playwright fallback for", targetUrl);
      const resp = await fetchWithPlaywright(targetUrl);
      res.set("Content-Type", resp.headers["content-type"] || "text/html");
      return res.status(resp.status || 200).send(resp.data);
    }

    const resp = await tryFetch(targetUrl, req.ip);
    console.log("Target URL:", targetUrl, "=> status", resp.status);

    const contentType = (resp.headers["content-type"] || "").toLowerCase();
    const proxyBase = buildProxyBase(req);

    if (resp.status >= 400) {
      const snippet = resp.data && resp.data.length ? resp.data.toString("utf8").slice(0,1000) : "";
      console.warn("Target returned status", resp.status);
      // NOTE: デバッグ用にヘッダとスニペットを返す（本番ではマスクする）
      return res.status(resp.status).set("Content-Type","text/html; charset=utf-8").send(
        `<h3>Proxy: target returned ${resp.status}</h3>
         <h4>Response headers:</h4><pre>${JSON.stringify(resp.headers,null,2)}</pre>
         <h4>Response snippet (first 1000 chars):</h4><pre>${snippet.replace(/</g,'&lt;')}</pre>`
      );
    }

    if (contentType.includes("text/html")) {
      let html = resp.data.toString("utf8");
      const $ = cheerio.load(html, { decodeEntities: false });

      $('meta[http-equiv="Content-Security-Policy"]').remove();
      $('meta[name="Content-Security-Policy"]').remove();
      $('base').remove();

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
        if (style && style.includes("url(")) $(el).attr("style", rewriteCssUrls(style, targetUrl, proxyBase));
      });

      $("style").each((_, el)=>{
        const txt = $(el).html();
        if (txt && txt.includes("url(")) $(el).html(rewriteCssUrls(txt, targetUrl, proxyBase));
      });

      $('meta[http-equiv="refresh"]').each((_, el)=>{
        const content = $(el).attr("content");
        if (!content) return;
        const m = content.match(/^\s*([\d]+)\s*;\s*url=(.*)/i);
        if (m) {
          const urlPart = m[2].replace(/^["']|["']$/g,"");
          const absolute = absUrl(urlPart, targetUrl);
          if (absolute) $(el).attr("content", `${m[1]};url=${proxyBase}/proxy?url=${encodeURIComponent(absolute)}`);
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
// --- 追加する Playwright フォールバック関数 ---
// ファイル上部（他 require の近く）に追加
async function fetchWithPlaywright(url) {
  // lazy load so server can start without playwright installed
  let playwright;
  try {
    playwright = require('playwright'); // require が失敗すると例外になる
  } catch (e) {
    console.error('[proxy] playwright not installed:', e.message);
    throw new Error('playwright-not-installed');
  }

  const browser = await playwright.chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true
  });
  try {
    const page = await browser.newPage({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });
    // optional timeout and waitUntil adjust as needed
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const content = await page.content();
    // gather cookies to reuse if needed
    try {
      const cookies = await page.context().cookies();
      const host = new URL(url).hostname;
      const map = cookieStore.get(host) || {};
      cookies.forEach(c => { map[c.name] = c.value; });
      cookieStore.set(host, map);
    } catch (e) {
      console.warn('[proxy] playwright cookie store failed', e.message);
    }
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, data: Buffer.from(content, 'utf8') };
  } finally {
    await browser.close();
  }
}
// ...取得後の処理（既存の resp がここにある想定）
// もし 403 なら Playwright フォールバックを試す
if (resp.status === 403) {
  console.warn('[proxy] received 403, attempting Playwright fallback for', targetUrl);
  try {
    // allow explicit override via query ?forcePlaywright=1
    if (req.query.forcePlaywright === '1') {
      const pwResp = await fetchWithPlaywright(targetUrl);
      res.set('Content-Type', pwResp.headers['content-type'] || 'text/html; charset=utf-8');
      return res.status(pwResp.status || 200).send(pwResp.data);
    }
    // automatic attempt
    const pwResp = await fetchWithPlaywright(targetUrl);
    console.log('[proxy] Playwright succeeded, returning rendered HTML');
    res.set('Content-Type', pwResp.headers['content-type'] || 'text/html; charset=utf-8');
    return res.status(pwResp.status || 200).send(pwResp.data);
  } catch (e) {
    console.warn('[proxy] playwright fallback failed:', e.message);
    // fallback failed: 続行して通常の 403 ハンドリングへ（ログを返す等）
  }
}
