const express = require('express');
const path = require('path');
const proxyRouter = require('./proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル（public 内のファイルを配信）
app.use(express.static(path.join(__dirname, 'public')));

// ルートページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// プロキシルーター（proxy.js）
app.use('/proxy', proxyRouter);

// optional: simple health
app.get('/_health', (req,res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
