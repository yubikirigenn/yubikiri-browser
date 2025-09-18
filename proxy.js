// proxy.js
const express = require('express');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { URL } = require('url');

const router = express.Router();

// follow redirects up to this
const MAX_REDIRECTS = 10;

function makeRequest(urlString, clientReqHeaders, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Too many redirects'));
    }

    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (e) {
      return reject(new Error('Invalid URL'));
    }

    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = Object.assign({}, {
      'User-Agent': clientReqHeaders['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept': clientReqHeaders['accept'] || '*/*',
      'Accept-Language': clientReqHeaders['accept-language'] || 'en-US,en;q=0.9',
      'Referer': clientReqHeaders['referer'] || urlObj.origin,
      // forward cookies from client if present
      'Cookie': clientReqHeaders['cookie'] || ''
    });

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
    };

    const upstreamReq = client.request(options, (upstreamRes) => {
      // handle redirects manually
      const status = upstreamRes.statusCode;
      if (status >= 300 && status < 400 && upstreamRes.headers.location) {
        // resolve relative location
        const loc = new URL(upstreamRes.headers.location, urlObj).toString();
        upstreamRes.resume(); // consume
        return resolve(makeRequest(loc, clientReqHeaders, redirectCount + 1));
      }

      resolve({ upstreamRes, finalUrl: urlObj.toString() });
    });

    upstreamReq.on('error', (err) => reject(err));
    upstreamReq.end();
  });
}

// helper: decode body based on content-encoding
function decodeBody(buffer, encoding) {
  if (!encoding) return Promise.resolve(buffer);
  encoding = encoding.toLowerCase();
  if (encoding === 'gzip') return new Promise((res, rej) => zlib.gunzip(buffer, (e, d) => e ? rej(e) : res(d)));
  if (encoding === 'deflate') return new Promise((res, rej) => zlib.inflate(buffer, (e, d) => e ? rej(e) : res(d)));
  if (encoding === 'br') return new Promise((res, rej) => zlib.brotliDecompress(buffer, (e, d) => e ? rej(e) : res(d)));
  return Promise.resolve(buffer);
}

// strip CSP/XFO meta tags from HTML
function stripMetaSecurity(html) {
  // remove meta http-equiv CSP or X-Frame-Options
  html = html.replace(/<meta[^>]*(http-equiv\s*=\s*["']?(content-security-policy|x-frame-options)["']?)[^>]*>/gi, '');
  html = html.replace(/<meta[^>]*(name\s*=\s*["']?(content-security-policy|x-frame-options)["']?)[^>]*>/gi, '');
  return html;
}

// rewrite all absolute and relative resource urls to /proxy?url=...
function rewriteHtmlResources(html, baseUrl) {
  // ensure base tag present for relative resolution
  if (!/\<base\s+/i.test(html)) {
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseUrl}">`);
  }

  // attributes: src, href
  html = html.replace(/(src|href)=["']([^"']+)["']/gi, (m, attr, v) => {
    // ignore javascript: and data:
    if (/^(javascript:|data:|#)/i.test(v)) return `${attr}="${v}"`;
    // resolve absolute url
    try {
      const abs = new URL(v, baseUrl).toString();
      return `${attr}="/proxy?url=${encodeURIComponent(abs)}"`;
    } catch (e) {
      return `${attr}="${v}"`;
    }
  });

  // srcset (multiple urls)
  html = html.replace(/srcset\s*=\s*["']([^"']+)["']/gi, (m, v) => {
    const parts = v.split(',');
    const newParts = parts.map(p => {
      const t = p.trim();
      const [urlPart, descriptor] = t.split(/\s+/);
      if (/^(javascript:|data:|#)/i.test(urlPart)) return t;
      try {
        const abs = new URL(urlPart, baseUrl).toString();
        return `/proxy?url=${encodeURIComponent(abs)}${descriptor ? ' ' + descriptor : ''}`;
      } catch { return t; }
    });
    return `srcset="${newParts.join(', ')}"`;
  });

  // CSS url(...) inside inline style tags or attributes
  html = html.replace(/url\((['"]?)(.*?)\1\)/gi, (m, q, u) => {
    if (/^(data:|javascript:|#)/i.test(u)) return m;
    try {
      const abs = new URL(u, baseUrl).toString();
      return `url("/proxy?url=${encodeURIComponent(abs)}")`;
    } catch {
      return m;
    }
  });

  return html;
}

// main route handles any target and returns either rewritten HTML or binary stream
router.get('/', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    const { upstreamRes, finalUrl } = await makeRequest(target, req.headers);

    // copy some headers but remove policies that would block embedding
    const exclude = new Set(['content-security-policy', 'x-frame-options', 'frame-options']);
    // CORS relax
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Credentials', 'true');

    // copy useful headers
    Object.keys(upstreamRes.headers || {}).forEach(k => {
      const lk = k.toLowerCase();
      if (exclude.has(lk)) return;
      // don't forward hop-by-hop headers
      if (['transfer-encoding', 'connection'].includes(lk)) return;
      const v = upstreamRes.headers[k];
      if (v) res.set(k, v);
    });

    const contentType = (upstreamRes.headers['content-type'] || '').toLowerCase();

    if (contentType.includes('text/html')) {
      // collect and decode body for rewriting
      const chunks = [];
      upstreamRes.on('data', c => chunks.push(c));
      upstreamRes.on('end', async () => {
        try {
          const raw = Buffer.concat(chunks);
          const encoding = upstreamRes.headers['content-encoding'];
          const decoded = await decodeBody(raw, encoding);
          let html = decoded.toString('utf8');

          // strip meta CSP/XFO
          html = stripMetaSecurity(html);

          // rewrite resource urls to route through this proxy
          html = rewriteHtmlResources(html, finalUrl);

          // send uncompressed HTML (remove content-encoding)
          res.removeHeader('Content-Encoding');
          res.set('Content-Type', 'text/html; charset=utf-8');
          res.status(upstreamRes.statusCode).send(html);
        } catch (e) {
          console.error('[proxy] html decode error', e);
          res.status(500).send('HTML processing error');
        }
      });
      upstreamRes.on('error', (e) => {
        console.error('[proxy] upstream html error', e);
        res.status(502).send('Upstream error');
      });
    } else {
      // binary or CSS/JS — stream directly to client
      // for CSS we might want to rewrite url(...) — but streaming preserves content and encoding.
      // If you need CSS rewriting, we would buffer and rewrite like HTML (tradeoff performance).
      // forward status and pipe
      res.status(upstreamRes.statusCode);
      upstreamRes.pipe(res);
    }
  } catch (err) {
    console.error('[proxy] error', err && err.stack ? err.stack : err);
    res.status(502).send('Upstream fetch error: ' + (err && err.message));
  }
});

module.exports = router;
