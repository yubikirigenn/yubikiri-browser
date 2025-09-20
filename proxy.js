// proxy.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

// helper: 絶対URL化と /proxy?url=... への変換
function toProxiedUrl(raw, base) {
  try {
    if (!raw) return raw;
    // data: や javascript: はそのまま
    if (/^(data|javascript):/i.test(raw)) return raw;
    const absolute = new URL(raw, base).toString();
    return `/proxy?url=${encodeURIComponent(absolute)}`;
  } catch (e) {
    return raw;
  }
}

// srcset の書き換え
function rewriteSrcset(srcset, base) {
  // "a.jpg 1x, b.jpg 2x"
  return srcset.split(',').map(part => {
    const p = part.trim();
    const spaceIdx = p.lastIndexOf(' ');
    if (spaceIdx === -1) {
      return toProxiedUrl(p, base);
    } else {
      const urlPart = p.substring(0, spaceIdx);
      const size = p.substring(spaceIdx + 1);
      return toProxiedUrl(urlPart, base) + ' ' + size;
    }
  }).join(', ');
}

router.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url parameter');

  try {
    // axios で取得（バイナリも想定）
    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ja,en-US;q=0.9'
      },
      validateStatus: null
    });

    const status = response.status || 200;
    const contentType = (response.headers['content-type'] || '').toLowerCase();

    // 常に CORS を許可（ブラウザ側の制限を緩和するため）
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');

    // 403/4xx/5xx はそのまま返す（デバッグに必要）
    if (status >= 400) {
      const txt = response.data ? response.data.toString('utf8') : `Error ${status}`;
      res.status(status).type('text/plain').send(txt);
      return;
    }

    // HTML の場合は書き換え
    if (contentType.includes('text/html')) {
      const html = response.data.toString('utf8');
      const $ = cheerio.load(html, { decodeEntities: false });

      // img[src], script[src], link[href] を書き換え
      $('img').each((_, el) => {
        const $el = $(el);
        const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src');
        if (src) {
          $el.attr('src', toProxiedUrl(src, targetUrl));
        }
        const srcset = $el.attr('srcset');
        if (srcset) {
          $el.attr('srcset', rewriteSrcset(srcset, targetUrl));
        }
      });

      $('source').each((_, el) => {
        const $el = $(el);
        const src = $el.attr('src');
        if (src) $el.attr('src', toProxiedUrl(src, targetUrl));
        const srcset = $el.attr('srcset');
        if (srcset) $el.attr('srcset', rewriteSrcset(srcset, targetUrl));
      });

      $('link').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        if (href) {
          $el.attr('href', toProxiedUrl(href, targetUrl));
        }
      });

      $('script').each((_, el) => {
        const $el = $(el);
        const src = $el.attr('src');
        if (src) $el.attr('src', toProxiedUrl(src, targetUrl));
        // inline scripts are left alone
      });

      // CSS内の url(...) と @import を簡易書き換え（style タグと inline style 属性）
      $('style').each((_, el) => {
        const txt = $(el).html();
        if (txt && txt.includes('url(')) {
          const replaced = txt.replace(/url\(([^)]+)\)/g, (m, p1) => {
            const stripped = p1.replace(/['"]/g, '').trim();
            return `url("${toProxiedUrl(stripped, targetUrl)}")`;
          });
          $(el).html(replaced);
        }
      });

      $('[style]').each((_, el) => {
        const st = $(el).attr('style');
        if (st && st.includes('url(')) {
          const replaced = st.replace(/url\(([^)]+)\)/g, (m, p1) => {
            const stripped = p1.replace(/['"]/g, '').trim();
            return `url("${toProxiedUrl(stripped, targetUrl)}")`;
          });
          $(el).attr('style', replaced);
        }
      });

      // 返却
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send($.html());
      return;
    }

    // HTML 以外（CSS, JS, 画像等）はそのまま返す
    if (contentType) res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (err) {
    console.error('Proxy error:', err && err.message ? err.message : err);
    res.status(500).send('Proxy error: ' + String(err));
  }
});

module.exports = router;
