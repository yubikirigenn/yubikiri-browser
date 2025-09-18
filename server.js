// server.js
const express = require('express');
const path = require('path');
const proxyRouter = require('./proxy');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.static(path.join(__dirname, 'public')));

// index
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// mount proxy router at /proxy
app.use('/proxy', proxyRouter);

// small health
app.get('/_health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`✅ yubikiri-proxy running at http://localhost:${PORT}`);
});
