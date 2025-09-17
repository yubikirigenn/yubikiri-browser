import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import querystring from 'querystring';

const PORT = process.env.PORT || 10000;

// HTML 読み込み
const indexHtml = fs.readFileSync(path.join('views', 'index.html'), 'utf8');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexHtml);

  } else if (req.method === 'POST' && req.url === '/proxy') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = querystring.parse(body);
      let targetUrl = params.url;

      // URLか検索語句か判定
      if (!/^https?:\/\//.test(targetUrl)) {
        targetUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(targetUrl);
      }

      try {
        const urlObj = new URL(targetUrl);
        const lib = urlObj.protocol === 'https:' ? https : http;

        lib.get(urlObj, (proxyRes) => {
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
          });
        }).on('error', err => {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<p style="color:red;">エラー: ${err.message}</p>`);
        });

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<p style="color:red;">不正なURLです</p>`);
      }
    });

  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
