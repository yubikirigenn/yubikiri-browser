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

// HTML を取得して全てのリソース URL を /r?url=... に書き換えて返す
async function html(req, res) {
  let target = req.query.url;
  if (!target) return res.status(400).send('URL is required');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const response = await axios.get(target, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'text',
      maxRedirects: 5,
      timeout: 15000
    });

    const $ = cheerio.load(response.data, { decodeEntities: false });

    // handle regular attributes: href/src/srcset
    $('[href]').each((i, el) => {
      const v = $(el).attr('href');
      if (v) $(el).attr('href', proxifyUrl(v, target));
    });
    $('[src]').each((i, el) => {
      const v = $(el).attr('src');
      if (v) $(el).attr('src', proxifyUrl(v, target));
    });
    // srcset -> multiple urls
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

    // CSS inside <style> tags: rewrite url(...)
    $('style').each((i, el) => {
      let css = $(el).html() || '';
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        const abs = new URL(u, target).href;
        return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
      });
      $(el).html(css);
    });

    // inline style attributes: rewrite url(...)
    $('[style]').each((i, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        const abs = new URL(u, target).href;
        return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
      });
      $(el).attr('style', style);
    });

    // Add a <base> tag so relative links inside the blob/html resolve against the proxied HTML file if needed
    // but we rewrote most links to /r so base is just extra safety.
    if ($('head base').length === 0) {
      $('head').prepend(`<base href="${target}">`);
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (err) {
    console.error('proxy.html error:', err.message || err);
    res.status(500).send(`Error fetching ${target}: ${err.message || err}`);
  }
}

// /r handler: fetch resource and return. If CSS, rewrite url() inside CSS similarly.
async function resource(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    const resp = await axios.get(target, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 5,
      timeout: 20000
    });

    const contentType = resp.headers['content-type'] || 'application/octet-stream';

    // If CSS, rewrite url(...) inside CSS to point back to /r
    if (contentType.includes('text/css') || target.endsWith('.css')) {
      let css = resp.data.toString('utf8');
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try {
          const abs = new URL(u, target).href;
          return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`;
        } catch {
          return m;
        }
      });
      res.set('Content-Type', 'text/css; charset=utf-8');
      return res.send(css);
    }

    // Otherwise stream binary (images, fonts, js, etc.)
    res.set('Content-Type', contentType);
    // optional: set caching headers here if you want
    return res.send(Buffer.from(resp.data, 'binary'));
  } catch (err) {
    console.error('resource error', err.message || err);
    res.status(500).send('resource fetch error: ' + (err.message || err));
  }
}

module.exports = { html, resource };
