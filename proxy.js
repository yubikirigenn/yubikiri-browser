// proxy.js
const axios = require('axios');
const cheerio = require('cheerio');

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

async function html(req, res) {
  let target = req.query.url;
  if (!target) return res.status(400).send('URL is required');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const response = await axios.get(target, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
      maxRedirects: 5,
      timeout: 20000
    });

    const $ = cheerio.load(response.data, { decodeEntities: false });

    // remove meta CSP / X-Frame meta tags that may block things
    $('meta[http-equiv="Content-Security-Policy"], meta[name="content-security-policy"], meta[http-equiv="X-Frame-Options"], meta[name="x-frame-options"]').remove();

    // rewrite href/src/srcset
    $('[href]').each((i, el) => {
      const v = $(el).attr('href');
      if (v) $(el).attr('href', proxifyUrl(v, target));
    });
    $('[src]').each((i, el) => {
      const v = $(el).attr('src');
      if (v) $(el).attr('src', proxifyUrl(v, target));
    });
    $('[srcset]').each((i, el) => {
      const s = $(el).attr('srcset');
      if (!s) return;
      const parts = s.split(',').map(p => {
        const trimmed = p.trim();
        const spaceIdx = trimmed.search(/\s/);
        if (spaceIdx === -1) return proxifyUrl(trimmed, target);
        const urlPart = trimmed.slice(0, spaceIdx);
        const rest = trimmed.slice(spaceIdx);
        return proxifyUrl(urlPart, target) + rest;
      });
      $(el).attr('srcset', parts.join(', '));
    });

    // style tags: rewrite @import and url()
    $('style').each((i, el) => {
      let css = $(el).html() || '';
      css = css.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/gi, (m, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `@import url("/r?url=${encodeURIComponent(abs)}");`;
        } catch { return m; }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch { return m; }
      });
      $(el).html(css);
    });

    // inline style attributes: rewrite url(...)
    $('[style]').each((i, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch { return m; }
      });
      $(el).attr('style', style);
    });

    // rewrite <link rel="stylesheet" href="..."> already handled by [href]

    // ensure base href exists for relative resolution fallback
    if ($('head base').length === 0) {
      $('head').prepend(`<base href="${target}">`);
    }

    // send sanitized HTML
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send($.html());
  } catch (err) {
    console.error('proxy.html error:', err && (err.message || err));
    return res.status(500).send(`Error fetching ${target}: ${err && (err.message || err)}`);
  }
}

async function resource(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    const resp = await axios.get(target, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 5,
      timeout: 30000
    });

    // determine content-type safely
    const contentType = (resp.headers['content-type'] || '').split(';')[0] || 'application/octet-stream';

    // If CSS, decode and rewrite @import/url inside CSS then send as text
    if (contentType === 'text/css' || /\.css(\?|$)/i.test(target)) {
      let css = resp.data.toString('utf8');
      css = css.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/gi, (m, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `@import url("/r?url=${encodeURIComponent(abs)}");`;
        } catch { return m; }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch { return m; }
      });
      res.set('Content-Type', 'text/css; charset=utf-8');
      return res.send(css);
    }

    // For other types (images, fonts, js), return binary buffer
    const buf = Buffer.from(resp.data);
    res.set('Content-Type', contentType);
    // Set conservative caching headers to reduce load (optional)
    res.set('Cache-Control', 'public, max-age=60'); // short cache
    return res.send(buf);
  } catch (err) {
    console.error('resource error', err && (err.message || err));
    return res.status(500).send('resource fetch error: ' + (err && (err.message || err)));
  }
}

module.exports = { html, resource };
