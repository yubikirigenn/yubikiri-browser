const express = require('express');
const path = require('path');
const proxyRouter = require('./proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));

// ルートページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// プロキシ
app.use('/proxy', proxyRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
