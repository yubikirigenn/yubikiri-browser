// server.js
const express = require('express');
const path = require('path');
const proxyRouter = require('./proxy'); // ルートに置く proxy.js

const app = express();
const PORT = process.env.PORT || 10000;

// 静的ファイル（public フォルダ）
app.use(express.static(path.join(__dirname, 'public')));

// ルートページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// /proxy にプロキシルータを割り当て
app.use('/proxy', proxyRouter);

// エラーハンドラ（最低限）
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  res.status(500).send('Server error');
});

app.listen(PORT, () => {
  console.log(`✅ yubikiri-proxy running at http://localhost:${PORT}`);
});
