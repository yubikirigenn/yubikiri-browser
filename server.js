const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

// プロキシルート
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL is required');

  try {
    const response = await axios.get(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);

    // リソースのURLを /proxy 経由に書き換え
    $('a, img, script, link').each((i, el) => {
      const attr = $(el).attr('href') ? 'href' : 'src';
      const val = $(el).attr(attr);
      if (val && !val.startsWith('data:') && !val.startsWith('javascript:')) {
        const absoluteUrl = new URL(val, targetUrl).href;
        $(el).attr(attr, `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
      }
    });

    res.send($.html());
  } catch (err) {
    res.status(500).send(`Error fetching ${targetUrl}: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Proxy running at http://localhost:${PORT}`);
});
