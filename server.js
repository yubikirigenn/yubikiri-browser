import http from 'http';
import https from 'https';
import { URL } from 'url';
import querystring from 'querystring';

const PORT = process.env.PORT || 10000;

const requestHandler = (req, res) => {
  if (req.url.startsWith('/proxy')) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const target = parsedUrl.searchParams.get('url');

    if (!target) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Not found: url parameter is missing');
      return;
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Not found: invalid URL');
      return;
    }

    const lib = targetUrl.protocol === 'https:' ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) YubikiriBrowser',
        'Accept': '*/*',
      }
    };

    lib.get(targetUrl, options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error fetching URL: ' + err.message);
    });

    return;
  }

  // それ以外は index.html を返す
  if (req.url === '/' || req.url === '/index.html') {
    import('fs').then(fs => {
      fs.readFile('./views/index.html', 'utf8', (err, data) => {
        if (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Error loading index.html');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      });
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
};

const server = http.createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
