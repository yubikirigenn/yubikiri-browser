const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS許可（フロントエンドからアクセス可能にする）
app.use(cors());

// 静的ファイル提供
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// プロキシエンドポイント（GitHub専用）
app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;

    // GitHubのみアクセス可能
    if (!url || !url.startsWith('https://github.com')) {
      return res.status(400).send('Invalid URL');
    }

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    res.send(response.data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error fetching the page');
  }
});

// GitHub Pages 風に index.html も提供
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ポート設定
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`yubikiri-proxy running on port ${port}`);
});
