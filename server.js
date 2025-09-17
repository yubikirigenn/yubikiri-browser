import express from 'express';
import puppeteer from 'puppeteer';
import cookieParser from 'cookie-parser';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// GETでトップページ表示
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './views' });
});

// POSTでURLを受け取り、Puppeteerでページを取得
app.post('/proxy', async (req, res) => {
  const url = req.body.url;
  if (!url) return res.status(400).send('URLが指定されていません');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 制限回避用のUser-Agent設定
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // ページ内容取得
    const content = await page.content();
    res.send(content);

  } catch (err) {
    console.error(err);
    res.status(500).send('ページ取得に失敗しました');
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Yubikiri Browser running on port ${PORT}`);
});
