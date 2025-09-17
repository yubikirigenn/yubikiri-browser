import http from 'http';
import https from 'https';
import fs from 'fs';
import url from 'url';

const PORT = 10000;

http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const query = parsed.query.q || '';
  const pathname = parsed.pathname;

  // ブログ(note)ページ
  if (pathname.startsWith('/note')) {
    const html = fs.readFileSync('./views/note.html', 'utf8');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
    return;
  }

  // URLか検索語句か判定
  let targetUrl;
  if (/^https?:\/\//.test(query)) {
    targetUrl = query;
  } else if (query) {
    // 検索語句の場合は DuckDuckGo
    targetUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  } else {
    // デフォルトページ
    const html = fs.readFileSync('./public/index.html', 'utf8');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(html);
    return;
  }

  // プロキシ経由でリクエスト
  const client = targetUrl.startsWith('https') ? https : http;
  client.get(targetUrl, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      res.end(body);
    });
  }).on('error', err => {
    res.writeHead(500, {'Content-Type':'text/plain'});
    res.end('Proxy error: ' + err.message);
  });

}).listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
