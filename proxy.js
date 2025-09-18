// proxy.js (完全版 - fetch不要, 制限回避フル装備)
const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const router = express.Router();

router.get('/', (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('url required');

  let targetUrl;
  try {
    targetUrl = new URL(/^https?:\/\//i.test(target) ? target : 'https://' + target);
  } catch (e) {
    return res.status(400).send('invalid url');
  }

  console.log('[proxy] request:', targetUrl.href);

  const client = targetUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: 'GET',
    headers: {
      // 本物ブラウザっぽい UA に偽装
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer': targetUrl.origin,
      'Cookie': req.headers['cookie'] || '' // クライアントからの Cookie を透過
    }
  };

  const proxyReq = client.request(options, (upstream) => {
    res.status(upstream.statusCode);

    // 制限回避用 CORS ヘッダ
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Credentials', 'true');

    // 上流の Content-Type, Cache などをコピー
    if (upstream.headers['content-type']) {
      res.set('Content-Type', upstream.headers['content-type']);
    }
    if (upstream.headers['cache-control']) {
      res.set('Cache-Control', upstream.headers['cache-control']);
    }
    if (upstream.headers['set-cookie']) {
      // Cookie 透過
      res.set('Set-Cookie', upstream.headers['set-cookie']);
    }

    let bodyChunks = [];
    upstream.on('data', (chunk) => bodyChunks.push(chunk));

    upstream.on('end', () => {
      const buffer = Buffer.concat(bodyChunks);
      const ct = upstream.headers['content-type'] || '';

      if (ct.includes('text/html')) {
        let text = buffer.toString('utf8');

        // HTML 内リンク書き換え
        text = text.replace(/(href|src)=["'](https?:\/\/[^"']+)["']/gi,
          (m, attr, url) => `${attr}="/proxy?url=${encodeURIComponent(url)}"`);

        // CSS 内の url(...) 書き換え
        text = text.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi,
          (m, q, url) => `url(/proxy?url=${encodeURIComponent(url)})`);

        return res.send(text);
      } else if (ct.includes('text/css')) {
        // CSS ファイル内の url(...) も置換
        let css = buffer.toString('utf8');
        css = css.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi,
          (m, q, url) => `url(/proxy?url=${encodeURIComponent(url)})`);
        return res.send(css);
      } else {
        // 画像や JS などはバイナリ転送
        return res.send(buffer);
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy] error:', err.message);
    res.status(502).send('Upstream fetch error: ' + err.message);
  });

  proxyReq.end();
});

module.exports = router;
