// proxy.js — 上書き
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

async function fetchFollowWithChain(url, opts = {}) {
  const chain = [];
  let cur = url;
  for (let i = 0; i < MAX_FOLLOW; i++) {
    try {
      const resp = await axios.get(cur, {
        responseType: opts.responseType || 'arraybuffer',
        headers: Object.assign({ 'User-Agent': USER_AGENT }, opts.headers || {}),
        timeout: opts.timeout || 30000,
        maxRedirects: 0,
        validateStatus: status => (status >= 200 && status < 400)
      });
      chain.push({ url: cur, status: resp.status, location: resp.headers.location || null });
      if (resp.status >= 300 && resp.status < 400 && resp.headers && resp.headers.location) {
        cur = new URL(resp.headers.location, cur).href;
        continue;
      }
      return { resp, finalUrl: cur, chain };
    } catch (err) {
      // axios may throw but include response on 3xx in some cases
      if (err && err.response && err.response.status >= 300 && err.response.status < 400 && err.response.headers && err.response.headers.location) {
        chain.push({ url: cur, status: err.response.status, location: err.response.headers.location || null });
        cur = new URL(err.response.headers.location, cur).href;
        continue;
      }
      // real error: return error and chain for debug
      return { error: err, chain };
    }
  }
  return { error: new Error('max redirects exceeded'), chain };
}

async function html(req, res) {
  let target = req.query.url;
  if (!target) return res.status(400).send('URL is required');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const { resp, finalUrl, error, chain } = await fetchFollowWithChain(target, { responseType: 'text', headers: { Accept: 'text/html' }, timeout: 20000 });
    if (error) {
      console.error('fetchFollow error (html):', (error && (error.message || error)).toString());
      console.error('fetch chain:', chain);
      return res.status(502).send(`Upstream fetch error: ${error && (error.message || String(error))}`);
    }

    const body = typeof resp.data === 'string' ? resp.data : resp.data.toString('utf8');
    const $ = cheerio.load(body, { decodeEntities: false });

    $('meta[http-equiv="Content-Security-Policy"], meta[name="content-security-policy"], meta[http-equiv="X-Frame-Options"], meta[name="x-frame-options"]').remove();

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

    $('style').each((i, el) => {
      let css = $(el).html() || '';
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
      $(el).html(css);
    });

    $('[style]').each((i, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, finalUrl).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch { return m; }
      });
      $(el).attr('style', style);
    });

    if ($('head base').length === 0) {
      $('head').prepend(`<base href="${finalUrl}">`);
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send($.html());
  } catch (err) {
    // more verbose error logging for diagnosis
    console.error('proxy.html error (catch):', err && (err.message || err));
    if (err && err.stack) console.error(err.stack);
    return res.status(500).send(`Internal proxy error: ${err && (err.message || String(err))}`);
  }
}

async function resource(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    const { resp, finalUrl, error, chain } = await fetchFollowWithChain(target, { responseType: 'arraybuffer', timeout: 30000 });
    if (error) {
      console.error('fetchFollow (resource) error:', (error && (error.message || error)).toString());
      console.error('resource fetch chain:', chain);
      return res.status(502).send(`Upstream resource fetch error: ${error && (error.message || String(error))}`);
    }

    const rawContentType = (resp.headers['content-type'] || '').split(';')[0] || '';
    const contentType = rawContentType || 'application/octet-stream';

    // prevent browser caching of redirect results
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');

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
      return res.send(css);
    }

    if (/javascript/.test(contentType) || /\.js(\?|$)/i.test(finalUrl)) {
      let jsText = resp.data.toString('utf8');
      jsText = jsText.replace(/fetch\(\s*(['"`])(https?:\/\/[^'"]+)\1/g, (m, q, u) => `fetch(${q}/r?url=${encodeURIComponent(u)}${q}`);
      jsText = jsText.replace(/import\(\s*(['"`])(https?:\/\/[^'"]+)\1\s*\)/g, (m, q, u) => `import(${q}/r?url=${encodeURIComponent(u)}${q})`);
      jsText = jsText.replace(/open\(\s*(['"`]?(GET|POST|PUT|DELETE)['"`]?)\s*,\s*(['"`])(https?:\/\/[^'"]+)\3/gi, (m, method, m2, q, u) => `open(${method}, ${q}/r?url=${encodeURIComponent(u)}${q}`);
      res.set('Content-Type', 'application/javascript; charset=utf-8');
      return res.send(jsText);
    }

    const buf = Buffer.from(resp.data);
    res.set('Content-Type', contentType);
    res.set('Content-Length', buf.length);
    return res.send(buf);
  } catch (err) {
    console.error('resource error (catch):', err && (err.message || err));
    if (err && err.stack) console.error(err.stack);
    return res.status(500).send('resource fetch error: ' + ((err && (err.message || err)) || 'unknown'));
  }
}

// debug endpoint
async function debug(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url required' });
  try {
    const { resp, finalUrl, error, chain } = await fetchFollowWithChain(target, { responseType: 'arraybuffer', timeout: 20000 });
    if (error) return res.status(200).json({ ok: false, error: String(error), chain });
    return res.status(200).json({
      ok: true,
      finalUrl,
      status: resp.status,
      headers: resp.headers,
      chain
    });
  } catch (e) {
    console.error('debug error', e && (e.stack || e));
    return res.status(500).json({ ok: false, error: String(e) });
  }
}

module.exports = { html, resource, debug };
