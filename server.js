const express = require('express');
const path = require('path');
const cors = require('cors');
const proxy = require('./proxy');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ルートで index.html
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'views', 'index.html'));
});

// プロキシルート
app.get('/proxy', proxy);

app.listen(PORT, () => {
  console.log(`✅ yubikiri-proxy running at http://localhost:${PORT}`);
});
