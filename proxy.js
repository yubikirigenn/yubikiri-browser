// proxy.js
const express = require('express');
const { wrapper } = require('axios-cookiejar-support');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const cheerio = require('cheerio');
const { URL } = require('url');
const crypto = require('crypto');

const router = express.Router();

// In-memory map: sessionId -> CookieJar
// (For production you'd persist or limit size/ttl)
const jars = new Map();

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').map(s => s.trim()).filter(Boolean).reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    acc[k] = decodeURIComponent(v);
    return acc;
  }, {});
}

function getSessionId(req, res) {
  const cookies = parseCookies(req);
  let sid = cookies.YUBIKIRI_SID;
  if (!sid) {
    sid = crypto.randomBytes(12).toString('hex');
    // set cookie (HttpOnly for safety)
    // Path=/ so subsequent proxy requests include it
    res.setHeader('Set-Cookie', `YUBIKIRI_SID=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  }
  if (!jars.has(sid)) jars.set(sid, new CookieJar());
  return sid;
}

function getClientForSid(sid) {
  const jar = jars.get(sid) || new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
  return client;
}

// helper to make absolute url from relative
function resolveUrl(base, relative) {
  try { return new URL(relative, base).toString(); }
  catch (e) { return null; }
}

// GET proxy: returns HTML (and rewrites forms to submit via /proxy/post)
router.get('/', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url param');

  const sid = getSessionId(req, res);
  const client = getClientForSid(sid);

  try {
    const response = await client.get(target, {
      responseType: 'text',
      headers: {
        'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
        'Accept-Language': req.headers['accept-language'] || 'ja,en;q=0.9',
        'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml',
        'Referer': req.headers.referer || new URL(target).origin
      }
    });

    const contentType = (response.headers['content-type'] || '').toLowerCase();

    if (!contentType.includes('text/html')) {
      // non-html - stream/pipe would be better, but for minimal version:
      res.set('Content-Type', contentType || 'application/octet-stream');
      return res.send(response.data);
    }

    // parse and rewrite
    const $ = cheerio.load(response.data);

    // rewrite resource URLs (optional — can improve later)
    $('img, script, link').each((i, el) => {
      const tag = el.tagName.toLowerCase();
      let attr = tag === 'link' ? 'href' : 'src';
      const val = $(el).attr(attr);
      if (!val) return;
      if (val.startsWith('data:')) return;
      const abs = resolveUrl(target, val);
      if (abs) $(el).attr(attr, `/proxy?url=${encodeURIComponent(abs)}`);
    });

    // rewrite all forms so submit goes through our POST proxy endpoint
    $('form').each((i, form) => {
      const $form = $(form);
      const origAction = $form.attr('action') || '';
      const absAction = resolveUrl(target, origAction) || target;
      // We'll submit to /proxy/post?target=<absAction> and preserve method
      const method = ($form.attr('method') || 'GET').toUpperCase();
      $form.attr('action', `/proxy/post?target=${encodeURIComponent(absAction)}&method=${method}`);
      $form.attr('method', 'POST'); // send via POST to our endpoint (we forward as needed)
      // optionally add a small hint input so server knows this was rewritten
      $form.prepend(`<input type="hidden" name="_yubikiri_origin" value="${encodeURIComponent(absAction)}">`);
    });

    // send modified HTML
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (err) {
    console.error('[proxy GET] error', err && err.stack ? err.stack : err);
    res.status(502).send('Proxy GET error: ' + (err && err.message));
  }
});

// POST proxy: receives form submits from rewritten forms and forwards to target
// We need raw body parsing so use express's text/body parser for typical forms
router.post('/post', express.urlencoded({ extended: false, limit: '5mb' }), async (req, res) => {
  const target = req.query.target;
  const method = (req.query.method || 'POST').toUpperCase();
  if (!target) return res.status(400).send('Missing target');

  const sid = getSessionId(req, res);
  const client = getClientForSid(sid);

  try {
    // Build forward headers
    const forwardHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Referer': req.headers.referer || new URL(target).origin,
      'Accept-Language': req.headers['accept-language'] || 'ja,en;q=0.9',
      'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded'
    };

    // req.body is parsed key->value; rebuild as urlencoded string if needed
    let data;
    if (forwardHeaders['Content-Type'].includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams();
      Object.keys(req.body || {}).forEach(k => params.append(k, req.body[k]));
      data = params.toString();
    } else {
      data = req.body;
    }

    const response = await client.request({
      url: target,
      method,
      headers: forwardHeaders,
      data,
      responseType: 'text',
      maxRedirects: 5
    });

    const ct = (response.headers['content-type'] || '').toLowerCase();
    if (ct.includes('text/html')) {
      // rewrite returned HTML same as GET (so next forms still go through us)
      const $ = cheerio.load(response.data);
      $('img, script, link').each((i, el) => {
        const tag = el.tagName.toLowerCase();
        let attr = tag === 'link' ? 'href' : 'src';
        const val = $(el).attr(attr);
        if (!val) return;
        if (val.startsWith('data:')) return;
        const abs = resolveUrl(target, val);
        if (abs) $(el).attr(attr, `/proxy?url=${encodeURIComponent(abs)}`);
      });
      $('form').each((i, form) => {
        const $form = $(form);
        const origAction = $form.attr('action') || '';
        const absAction = resolveUrl(target, origAction) || target;
        const m = ($form.attr('method') || 'GET').toUpperCase();
        $form.attr('action', `/proxy/post?target=${encodeURIComponent(absAction)}&method=${m}`);
        $form.attr('method', 'POST');
        $form.prepend(`<input type="hidden" name="_yubikiri_origin" value="${encodeURIComponent(absAction)}">`);
      });
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send($.html());
    } else {
      // non-html, just forward content
      res.set('Content-Type', response.headers['content-type'] || 'application/octet-stream');
      return res.send(response.data);
    }
  } catch (err) {
    console.error('[proxy POST] forward error', err && err.stack ? err.stack : err);
    return res.status(502).send('Proxy POST error: ' + (err && err.message));
  }
});

module.exports = router;
