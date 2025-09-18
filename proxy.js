// proxy.js
// 強化版プロキシ：
// - HTML/CSS/JS 内の URL を /r?url=... に徹底的に書き換え
// - リソース取得時にリダイレクトチェーンを手動追跡（最大 20）
// - 元サイトの CSP / X-Frame-Options 等の制限ヘッダをブラウザに渡さない
// - CSS 内 @import / url() の書き換え強化、inline script の簡易 URL 書き換え

const axios = require('axios');
const cheerio = require('cheerio');

const MAX_FOLLOW = 20;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function proxifyUrl(raw, base) {
  if (!raw) return raw;
  raw = raw.trim();
  if (/^(data:|javascript:|mailto:|#)/i.test(raw)) return raw;
  try {
    const abs = new URL(raw, base).href;
    return `/r?url=${encodeURIComponent(abs)}`;
  } catch (e) {
    return raw;
  }
}

// 手動でリダイレクトを追跡して最終レスポンスを返すヘルパー
async function fetchFollow(url, opts = {}) {
  let cur = url;
  let resp = null;
  for (let i = 0; i < MAX_FOLLOW; i++) {
    try {
      // maxRedirects:0 -> axios won't follow. we check status and location ourselves.
      resp = await axios.get(cur, {
        responseType: opts.responseType || 'arraybuffer',
        headers: Object.assign({ 'User-Agent': USER_AGENT }, opts.headers || {}),
        timeout: opts.timeout || 30000,
        maxRedirects: 0,
        validateStatus: status => (status >= 200 && status < 400) // accept 3xx for manual handling
      });
    } catch (err) {
      // axios throws for network errors or for status outside validateStatus
      if (err && err.response && (err.response.status >= 300 && err.response.status < 400) && err.response.headers && err.response.headers.location) {
        // handle like below
        resp = err.response;
      } else {
        throw err;
      }
    }

    if (!resp) throw new Error('No response');

    // if it's a redirect (3xx) and location present -> follow
    if (resp.status >= 300 && resp.status < 400 && resp.headers && resp.headers.location) {
      // resolve relative location against current URL
      try {
        cur = new URL(resp.headers.location, cur).href;
        continue; // follow next
      } catch (e) {
        // cannot resolve -> break and return this resp
        break;
      }
    }

    // not a redirect -> return resp and final URL
    return { resp, finalUrl: cur };
  }

  // exceeded follow limit
  return { resp, finalUrl: cur };
}

// HTML プロキシハンドラ
async function html(req, res) {
  let target = req.query.url;
  if (!target) return res.status(400).send('URL is required');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const { resp, finalUrl } = await fetchFollow(target, { responseType: 'text', headers: { Accept: 'text/html' }, timeout: 20000 });

    const body = typeof resp.data === 'string' ? resp.data : resp.data.toString('utf8');
    const $ = cheerio.load(body, { decodeEntities: false });

    // remove meta CSP / X-Frame-Options meta tags that may block things
    $('meta[http-equiv="Content-Security-Policy"], meta[name="content-security-policy"], meta[http-equiv="X-Frame-Options"], meta[name="x-frame-options"]').remove();

    // rewrite href/src/srcset to /r?url=...
    $('[href]').each((i, el) => {
      const v = $(el).attr('href');
      if (v) $(el).attr('href', proxifyUrl(v, finalUrl));
    });
    $('[src]').each((i, el) => {
      const v = $(el).attr('src');
      if (v) $(el).attr('src', proxifyUrl(v, finalUrl));
    });
    $('[srcset]').each((i, el) => {
      const s = $(el).attr('srcset');
      if (!s) return;
      const parts = s.split(',').map(p => {
        const trimmed = p.trim();
        const spaceIdx = trimmed.search(/\s/);
        if (spaceIdx === -1) return proxifyUrl(trimmed, finalUrl);
        const urlPart = trimmed.slice(0, spaceIdx);
        const rest = trimmed.slice(spaceIdx);
        return proxifyUrl(urlPart, finalUrl) + rest;
      });
      $(el).attr('srcset', parts.join(', '));
    });

    // style tags: rewrite @import and url(...)
    $('style').each((i, el) => {
      let css = $(el).html() || '';
      css = css.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/gi, (m, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `@import url("/r?url=${encodeURIComponent(abs)}");`;
        } catch {
          return m;
        }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch {
          return m;
        }
      });
      $(el).html(css);
    });

    // inline style attributes: rewrite url(...)
    $('[style]').each((i, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch {
          return m;
        }
      });
      $(el).attr('style', style);
    });

    // inline scripts: attempt to rewrite common absolute URLs used in fetch/import patterns
    $('script:not([src])').each((i, el) => {
      let js = $(el).html() || '';

      // fetch('https://...') or fetch("https://...")
      js = js.replace(/fetch\(\s*(['"`])(https?:\/\/[^'"]+)\1/g, (m, q, u) => {
        return `fetch(${q}/r?url=${encodeURIComponent(u)}${q}`;
      });

      // import('https://...')
      js = js.replace(/import\(\s*(['"`])(https?:\/\/[^'"]+)\1\s*\)/g, (m, q, u) => {
        return `import(${q}/r?url=${encodeURIComponent(u)}${q})`;
      });

      // XHR open('GET', 'https://...')
      js = js.replace(/open\(\s*(['"`]?(GET|POST|PUT|DELETE)['"`]?)\s*,\s*(['"`])(https?:\/\/[^'"]+)\3/gi, (m, method, m2, q, u) => {
        return `open(${method}, ${q}/r?url=${encodeURIComponent(u)}${q}`;
      });

      $(el).html(js);
    });

    // Ensure <base> tag is present to help resolution inside iframe/srcdoc
    if ($('head base').length === 0) {
      $('head').prepend(`<base href="${finalUrl}">`);
    }

    // Set our own headers (do NOT forward CSP/X-Frame headers from origin)
    res.set('Content-Type', 'text/html; charset=utf-8');
    // Optional: allow framing from anywhere by not setting X-Frame-Options or CSP
    // Do NOT copy any of origin response headers that could restrict embedding

    return res.send($.html());
  } catch (err) {
    console.error('proxy.html error:', err && (err.message || err));
    return res.status(500).send(`Error fetching ${target}: ${(err && err.message) || err}`);
  }
}

// /r handler: fetch resource (follow redirects manually) and return with safe headers
async function resource(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    const { resp, finalUrl } = await fetchFollow(target, { responseType: 'arraybuffer', timeout: 30000 });

    if (!resp) return res.status(500).send('No response from upstream');

    // determine content-type
    const rawContentType = (resp.headers['content-type'] || '').split(';')[0] || '';
    const contentType = rawContentType || 'application/octet-stream';

    // If CSS text, decode, rewrite @import/url and return as text
    if (contentType === 'text/css' || /\.css(\?|$)/i.test(finalUrl)) {
      let css = resp.data.toString('utf8');
      css = css.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/gi, (m, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `@import url("/r?url=${encodeURIComponent(abs)}");`;
        } catch { return m; }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch { return m; }
      });

      res.set('Content-Type', 'text/css; charset=utf-8');
      // Avoid passing origin CSP/XFO headers
      res.set('Cache-Control', 'public, max-age=60');
      return res.send(css);
    }

    // For JS text (some servers serve js as application/javascript)
    if (/javascript/.test(contentType) || /\.js(\?|$)/i.test(finalUrl)) {
      let jsText = resp.data.toString('utf8');

      // attempt to rewrite absolute URLs in js code for fetch/import/open patterns
      jsText = jsText.replace(/fetch\(\s*(['"`])(https?:\/\/[^'"]+)\1/g, (m, q, u) => `fetch(${q}/r?url=${encodeURIComponent(u)}${q}`);
      jsText = jsText.replace(/import\(\s*(['"`])(https?:\/\/[^'"]+)\1\s*\)/g, (m, q, u) => `import(${q}/r?url=${encodeURIComponent(u)}${q})`);
      jsText = jsText.replace(/open\(\s*(['"`]?(GET|POST|PUT|DELETE)['"`]?)\s*,\s*(['"`])(https?:\/\/[^'"]+)\3/gi, (m, method, m2, q, u) => `open(${method}, ${q}/r?url=${encodeURIComponent(u)}${q}`);

      res.set('Content-Type', 'application/javascript; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=60');
      return res.send(jsText);
    }

    // Binary: images, fonts, etc. Return raw buffer with safe headers
    const buf = Buffer.from(resp.data);

    res.set('Content-Type', contentType);
    res.set('Content-Length', buf.length);
    // short caching to reduce repeated fetches but avoid stale redirect issues
    res.set('Cache-Control', 'public, max-age=60');
    return res.send(buf);
  } catch (err) {
    console.error('resource error', err && (err.message || err));
    return res.status(500).send('resource fetch error: ' + ((err && err.message) || err));
  }
}

module.exports = { html, resource };
