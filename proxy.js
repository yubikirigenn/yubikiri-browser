const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

// 簡易制限回避: User-Agent, Referer を指定
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.google.com/'
};

router.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL required');

  try {
    const response = await axios.get(targetUrl, {
      headers: defaultHeaders,
      responseType: 'text'
    });

    // cheerio で DOM を読み込み
    const $ = cheerio.load(response.data);

    // <head> に簡単な script 注入例
    $('head').prepend(`<script>console.log("Injected script");</script>`);

    res.send($.html());
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Fetch error');
  }
});

module.exports = router;
