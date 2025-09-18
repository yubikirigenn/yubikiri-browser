const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// GitHub専用プロキシ
app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url || !url.startsWith('https://github.com')) {
      return res.status(400).send('Invalid URL');
    }

    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    res.send(response.data);
  } catch (err) {
    res.status(500).send('Error fetching the page');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`yubikiri-proxy running on port ${port}`);
});
