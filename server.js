const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// CORSを許可（フロントからアクセス可能にする）
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// プロキシエンドポイント（任意のサイト）
app.get('/proxy', async (req, res) => {
  try {
    let { url } = req.query;

    if (!url) return res.status(400).send('URLを入力してください');

    url = url.trim();

    // http/https が無ければ https:// を補完
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      responseType: 'arraybuffer' // 画像やバイナリにも対応
    });

    // コンテンツタイプをそのまま返す
    res.set('Content-Type', response.headers['content-type'] || 'text/html');
    res.send(response.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('サイトの取得に失敗しました');
  }
});

// index.html を返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`yubikiri-proxy running on port ${port}`);
});
