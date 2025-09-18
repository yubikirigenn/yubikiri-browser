const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();

// 静的ファイル (CSS / JS)
app.use(express.static(path.join(__dirname, 'public')));

// HTMLを書き換えて返すプロキシ
app.get('/proxy', async (req, res) => {
  let url = req.query.url;
  if (!url) return res.status(400).send('URLが必要です');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const response = await axios.get(url, { responseType: 'text' });
    const $ = cheerio.load(response.data);

    // a, link, script, img のパスを /proxy 経由に書き換え
    $('a[href], link[href], script[src], img[src]').each((i, el) => {
      const attr = el.name === 'a' || el.name === 'link' ? 'href' : 'src';
      const value = $(el).attr(attr);
      if (value) {
        const abs = new URL(value, url).toString();
        $(el).attr(attr, `/proxy?url=${encodeURIComponent(abs)}`);
      }
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (err) {
    console.error(err.message);
    res.status(500).send('取得に失敗しました');
  }
});

// トップページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Yubikiri Proxy running on port ${port}`);
});
