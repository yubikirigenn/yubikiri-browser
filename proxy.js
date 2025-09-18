const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL is required');

  try {
    const response = await axios.get(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);

    // a, img, script, link タグの URL を /proxy 経由に書き換え
    $('a, img, script, link').each((i, el) => {
      const attr = $(el).attr('href') ? 'href' : 'src';
      const val = $(el).attr(attr);
      if (val && !val.startsWith('data:') && !val.startsWith('javascript:')) {
        const absoluteUrl = new URL(val, targetUrl).href;
        $(el).attr(attr, `/proxy?url=${encodeURIComponent(absoluteUrl)}`);
      }
    });

    // CSS 内の url() も書き換え
    $('style').each((i, el) => {
      let css = $(el).html();
      css = css.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, url) => {
        if (url.startsWith('data:')) return match;
        const absUrl = new URL(url, targetUrl).href;
        return `url(${quote}/proxy?url=${encodeURIComponent(absUrl)}${quote})`;
      });
      $(el).html(css);
    });

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send($.html());
  } catch (err) {
    res.status(500).send(`Error fetching ${targetUrl}: ${err.message}`);
  }
};
