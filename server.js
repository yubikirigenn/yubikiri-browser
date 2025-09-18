// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const proxy = require('./proxy');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ルートは既存の index.html を返す（変更なしならそのまま）
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'views', 'index.html'));
});

// HTML を取得して書き換えるプロキシ（返すのは HTML）
app.get('/proxy', proxy.html);

// 各種リソース（画像/CSS/フォント/JS等）を代理取得して返す
app.get('/r', proxy.resource);

app.listen(PORT, () => {
  console.log(`✅ yubikiri-proxy running at http://localhost:${PORT}`);
});
