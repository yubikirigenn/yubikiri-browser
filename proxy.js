// proxy.js
// 改善版：HTML の参照を書き換え徹底、リダイレクト追跡、プリパッチ注入（fetch/XHR/img）
// 前提：express 側で app.get('/proxy', proxy.html) と app.get('/r', proxy.resource) が設定されている

const axios = require('axios');
const cheerio = require('cheerio');

const MAX_FOLLOW = 25;
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
      if (err && err.response && err.response.status >= 300 && err.response.status < 400 && err.response.headers && err.response.headers.location) {
        chain.push({ url: cur, status: err.response.status, location: err.response.headers.location || null });
        cur = new URL(err.response.headers.location, cur).href;
        continue;
      }
      return { error: err, chain };
    }
  }
  return { error: new Error('max redirects exceeded'), chain };
}

// small client-side pre-patch script to catch dynamic fetch/XHR/img before other scripts run
const PREPATCH = `(function(){
  try{
    if(window.__YUBI_PREPATCH) return;
    window.__YUBI_PREPATCH = true;

    // helper to proxify a URL
    function prox(u){
      try{
        const parsed = new URL(u, location.href);
        if(parsed.origin !== location.origin){
          return '/r?url=' + encodeURIComponent(parsed.href);
        }
      }catch(e){}
      return u;
    }

    // patch fetch
    const _origFetch = window.fetch;
    window.fetch = function(input, init){
      try{
        let url = (typeof input === 'string') ? input : (input && input.url);
        if(url){
          const p = prox(url);
          if(typeof input === 'string') input = p;
          else input = new Request(p, input);
        }
      }catch(e){}
      return _origFetch.apply(this, arguments);
    };

    // patch XMLHttpRequest.open
    const OrigOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url){
      try{
        const p = prox(url);
        return OrigOpen.call(this, method, p, ...Array.prototype.slice.call(arguments,2));
      }catch(e){}
      return OrigOpen.apply(this, arguments);
    };

    // patch Image.prototype.src setter
    try {
      const imgProto = HTMLImageElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(imgProto, 'src') || {};
      if(desc && desc.set){
        const origSet = desc.set;
        Object.defineProperty(imgProto, 'src', {
          configurable: true,
          enumerable: true,
          get: function(){ return this.getAttribute('src'); },
          set: function(v){
            try{ v = prox(v); }catch(e){}
            origSet.call(this, v);
          }
        });
      }
    } catch(e){}

    // patch element.setAttribute for src/srcset/href
    const OrigSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value){
      try{
        if(name && (name.toLowerCase()==='src' || name.toLowerCase()==='href')){
          value = prox(value);
        } else if(name && name.toLowerCase()==='srcset'){
          // rewrite each url in srcset
          value = value.split(',').map(p=>{
            const t=p.trim();
            const parts=t.split(/\s+/);
            parts[0] = prox(parts[0]);
            return parts.join(' ');
          }).join(', ');
        }
      }catch(e){}
      return OrigSetAttr.call(this, name, value);
    };

    // patch createElement for IMG to ensure future created images are proxified via setAttribute patch above
    const OrigCreate = Document.prototype.createElement;
    Document.prototype.createElement = function(tag){
      return OrigCreate.call(this, tag);
    };

  }catch(e){
    console.warn('yubipatch err', e);
  }
})();`;

// HTML handler
async function html(req, res) {
  let target = req.query.url;
  if (!target) return res.status(400).send('URL is required');
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  try {
    const { resp, finalUrl, error, chain } = await fetchFollowWithChain(target, { responseType: 'text', headers: { Accept: 'text/html' }, timeout: 20000 });
    if (error) {
      console.error('fetchFollow error (html):', error && (error.message || error).toString(), 'chain:', chain);
      return res.status(502).send('Upstream fetch error');
    }

    const body = typeof resp.data === 'string' ? resp.data : resp.data.toString('utf8');
    const $ = cheerio.load(body, { decodeEntities: false });

    // ensure <head> exists
    if ($('head').length === 0) {
      $('html').prepend('<head></head>');
    }

    // remove meta CSP / X-Frame-Options meta tags that may block things
    $('meta[http-equiv="Content-Security-Policy"], meta[name="content-security-policy"], meta[http-equiv="X-Frame-Options"], meta[name="x-frame-options"]').remove();

    // rewrite basic attributes
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
        try { const abs = new URL(u, finalUrl).href; return `@import url("/r?url=${encodeURIComponent(abs)}");`; } catch { return m; }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try { const abs = new URL(u, finalUrl).href; return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`; } catch { return m; }
      });
      $(el).html(css);
    });

    // inline style attributes
    $('[style]').each((i, el) => {
      let style = $(el).attr('style') || '';
      style = style.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try { const abs = new URL(u, finalUrl).href; return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`; } catch { return m; }
      });
      $(el).attr('style', style);
    });

    // rewrite external scripts/links to point to /r
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) $(el).attr('href', proxifyUrl(href, finalUrl));
    });
    $('script[src]').each((i, el) => {
      const s = $(el).attr('src');
      if (s) $(el).attr('src', proxifyUrl(s, finalUrl));
    });

    // attempt to rewrite inline scripts: replace direct fetch/import/open patterns
    $('script:not([src])').each((i, el) => {
      let js = $(el).html() || '';
      js = js.replace(/fetch\(\s*(['"`])(https?:\/\/[^'"]+)\1/g, (m, q, u) => `fetch(${q}/r?url=${encodeURIComponent(u)}${q}`);
      js = js.replace(/import\(\s*(['"`])(https?:\/\/[^'"]+)\1\s*\)/g, (m, q, u) => `import(${q}/r?url=${encodeURIComponent(u)}${q})`);
      js = js.replace(/open\(\s*(['"`]?(GET|POST|PUT|DELETE)['"`]?)\s*,\s*(['"`])(https?:\/\/[^'"]+)\3/gi, (m, method, m2, q, u) => `open(${method}, ${q}/r?url=${encodeURIComponent(u)}${q}`);
      $(el).html(js);
    });

    // ensure base tag for relative resolution
    if ($('head base').length === 0) {
      $('head').prepend(`<base href="${finalUrl}">`);
    }

    // insert prepatch script at the very top of head so it runs before site's scripts
    $('head').prepend(`<script>${PREPATCH}</script>`);

    // finally send sanitized HTML (do not forward origin CSP/XFO headers)
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send($.html());
  } catch (err) {
    console.error('proxy.html error (catch):', err && (err.message || err));
    if (err && err.stack) console.error(err.stack);
    return res.status(500).send(`Internal proxy error: ${err && (err.message || String(err))}`);
  }
}

// resource handler
async function resource(req, res) {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  try {
    // set common headers including Referer to help CDN accept the request
    const headers = { 'User-Agent': USER_AGENT, 'Accept': '*/*' };
    try { headers['Referer'] = new URL(target).origin; } catch(e){}

    const { resp, finalUrl, error, chain } = await fetchFollowWithChain(target, { responseType: 'arraybuffer', headers, timeout: 30000 });
    if (error) {
      console.error('fetchFollow (resource) error:', error && (error.message || error), 'chain:', chain);
      return res.status(502).send('Upstream resource fetch error');
    }

    const rawContentType = (resp.headers['content-type'] || '').split(';')[0] || '';
    const contentType = rawContentType || 'application/octet-stream';

    // prevent browser caching redirects
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');

    if (contentType === 'text/css' || /\.css(\?|$)/i.test(finalUrl)) {
      let css = resp.data.toString('utf8');
      css = css.replace(/@import\s+(?:url\()?['"]?(.*?)['"]?\)?\s*;/gi, (m, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try { const abs = new URL(u, finalUrl).href; return `@import url("/r?url=${encodeURIComponent(abs)}");`; } catch { return m; }
      });
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (m, q, u) => {
        if (/^(data:|javascript:|#)/i.test(u)) return m;
        try { const abs = new URL(u, finalUrl).href; return `url(${q}/r?url=${encodeURIComponent(abs)}${q})`; } catch { return m; }
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

module.exports = { html, resource };
