const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

// URLを受け取り、書き換えて返す
app.get('/proxy', async (req, res) => {
  let url = req.query.url;
  if (!url) return res.status(400).send('URLが必要です');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  try {
    const response = await axios.get(url, { responseType: 'text' });

    // HTMLを読み込み
    let html = response.data;
    const $ = cheerio.load(html);

    // リンクや画像・スクリプトを全部 /proxy 経由に書き換える
    $('a[href], link[href], script[src], img[src]').each((i, el) => {
      const attr = el.name === 'a' || el.name === 'link' ? 'href' : 'src';
      const value = $(el).attr(attr);
      if (value) {
        const abs = new URL(value, url).toString();
        $(el).attr(attr, `/proxy?url=${encodeURIComponent(abs)}`);
      }
    });

    // レスポンスを返す（ヘッダ制限を削除）
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (err) {
    console.error(err.message);
    res.status(500).send('取得に失敗しました');
  }
});

// トップページ
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Yubikiri Proxy</title></head>
      <body>
        <h1>Yubikiri Proxy</h1>
        <form action="/proxy" method="get">
          <input type="text" name="url" placeholder="https://example.com" style="width:300px">
          <button type="submit">Go</button>
        </form>
      </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Yubikiri Proxy running');
});
