import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import querystring from 'querystring';

const PORT = process.env.PORT || 10000;

// index.html を配信
const indexFile = path.join('./views', 'index.html');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(indexFile, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/proxy') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const { url } = querystring.parse(body.toString());
      if (!url) {
        res.writeHead(400);
        return res.end('URL required');
      }

      // URLか検索語句か判定
      let targetUrl;
      if (/^https?:\/\//i.test(url)) {
        targetUrl = url;
      } else {
        // 検索語句はDuckDuckGo
        targetUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
      }

      // HTTP or HTTPS を自動判別
      const client = targetUrl.startsWith('https') ? https : http;

      client.get(targetUrl, resp => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(data);
        });
      }).on('error', err => {
        res.writeHead(500);
        res.end('Proxy error: ' + err.message);
      });
    });
    return;
  }

  // それ以外は404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => console.log(`Yubikiri Browser running on port ${PORT}`));
