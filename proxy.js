const express = require('express');
const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const cheerio = require('cheerio');

const router = express.Router();

// CookieJar を作成
const jar = new tough.CookieJar();

// axios に CookieJar を適用
axiosCookieJarSupport(axios);

router.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url parameter");

  try {
    const response = await axios.get(targetUrl, {
      jar,
      withCredentials: true,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const contentType = response.headers['content-type'];

    if (contentType.includes('text/html')) {
      const html = response.data.toString('utf-8');
      const $ = cheerio.load(html);

      // リンク書き換え
      $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.startsWith('data:')) $(el).attr('src', `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
      });
      $('link').each((_, el) => {
        const href = $(el).attr('href');
        if (href) $(el).attr('href', `/proxy?url=${encodeURIComponent(new URL(href, targetUrl))}`);
      });
      $('script').each((_, el) => {
        const src = $(el).attr('src');
        if (src) $(el).attr('src', `/proxy?url=${encodeURIComponent(new URL(src, targetUrl))}`);
      });

      res.set('Content-Type', 'text/html');
      res.send($.html());
    } else {
      // HTML 以外
      res.set('Content-Type', contentType);
      res.send(response.data);
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).send('Proxy error: ' + err.message);
  }
});

module.exports = router;
